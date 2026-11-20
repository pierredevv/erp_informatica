import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';
import { emailHtmlFromText } from '../common/email-html';

interface ClaimedEmail {
  id: string;
  toAddress: string;
  subject: string;
  body: string;
  attempts: number;
}

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 20;
// Debe ser mayor al timeout del proveedor para que una instancia nunca recupere un envío aún en curso.
const CLAIM_TTL_SECONDS = 10 * 60;
const RETRY_DELAY_MS = 5 * 60 * 1000;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private running = false;
  private warnedNotConfigured = false;

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(to: string, subject: string, body: string): Promise<void> {
    await this.prisma.emailOutbox.create({
      data: { toAddress: to, subject, body },
    });
  }

  private transporter(): Transporter | null {
    if (config.mailProvider === 'brevo' || !config.smtpHost) return null;
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    });
  }

  /** Brevo se llama por HTTPS (443): Render Free bloquea el puerto SMTP 587. */
  private async sendViaBrevo(email: ClaimedEmail): Promise<void> {
    const response = await fetch(config.brevoUrl, {
      method: 'POST',
      headers: {
        'api-key': config.brevoApiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: config.mailFromName, email: config.mailFromEmail },
        to: [{ email: email.toAddress }],
        subject: email.subject,
        htmlContent: emailHtmlFromText(email.body),
        textContent: email.body,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Brevo HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processOutbox(): Promise<void> {
    // Evita dos ciclos concurrentes dentro de la misma instancia.
    if (this.running) return;
    if (!config.mailConfigured) {
      if (!this.warnedNotConfigured) {
        this.logger.warn('No hay proveedor de correo configurado; los mensajes quedan pendientes en el outbox');
        this.warnedNotConfigured = true;
      }
      return;
    }
    this.running = true;

    try {
      await this.releaseExpiredClaims();

      // Claim atómico: SKIP LOCKED garantiza que cada fila sea tomada por una sola instancia,
      // aunque la API local y Render compartan la misma base de datos.
      const claimed = await this.prisma.$queryRaw<ClaimedEmail[]>`
        UPDATE "EmailOutbox" AS o
        SET status = 'PROCESSING',
            attempts = o.attempts + 1,
            "nextAttemptAt" = NOW() + (${CLAIM_TTL_SECONDS} * INTERVAL '1 second')
        WHERE o.id IN (
          SELECT id
          FROM "EmailOutbox"
          WHERE status = 'PENDING'
            AND attempts < ${MAX_ATTEMPTS}
            AND "nextAttemptAt" <= NOW()
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${BATCH_SIZE}
        )
        RETURNING o.id, o."toAddress", o.subject, o.body, o.attempts
      `;

      if (claimed.length === 0) return;
      const transporter = this.transporter();
      for (const email of claimed) {
        await this.deliver(email, transporter);
      }
    } catch (error) {
      this.logger.error('Error al procesar el outbox de correos', error);
    } finally {
      this.running = false;
    }
  }

  /** Devuelve al estado PENDING los reclamos abandonados por una instancia caída. */
  private async releaseExpiredClaims(): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "EmailOutbox"
      SET status = 'PENDING'
      WHERE status = 'PROCESSING' AND "nextAttemptAt" <= NOW()
    `;
  }

  private async deliver(email: ClaimedEmail, transporter: Transporter | null): Promise<void> {
    try {
      if (config.mailProvider === 'brevo') {
        await this.sendViaBrevo(email);
      } else if (transporter) {
        await transporter.sendMail({
          from: config.smtpFrom,
          to: email.toAddress,
          subject: email.subject,
          html: emailHtmlFromText(email.body),
          text: email.body,
        });
      } else {
        throw new Error('No hay proveedor de correo configurado');
      }

      // updateMany con status PROCESSING evita que un ciclo viejo sobrescriba un reclamo nuevo.
      await this.prisma.emailOutbox.updateMany({
        where: { id: email.id, status: 'PROCESSING' },
        data: { status: 'SENT', sentAt: new Date(), error: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exhausted = email.attempts >= MAX_ATTEMPTS;
      await this.prisma.emailOutbox.updateMany({
        where: { id: email.id, status: 'PROCESSING' },
        data: {
          status: exhausted ? 'FAILED' : 'PENDING',
          error: message.slice(0, 500),
          nextAttemptAt: new Date(Date.now() + RETRY_DELAY_MS),
        },
      });
      this.logger.warn(`No se pudo enviar el correo ${email.id} (intento ${email.attempts}): ${message}`);
    }
  }
}
