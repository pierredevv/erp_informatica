import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(to: string, subject: string, body: string): Promise<void> {
    await this.prisma.emailOutbox.create({
      data: { toAddress: to, subject, body },
    });
  }

  private transporter(): Transporter | null {
    if (!config.smtpHost) return null;
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processOutbox(): Promise<void> {
    const pending = await this.prisma.emailOutbox.findMany({
      where: { status: 'PENDING', attempts: { lt: 3 }, nextAttemptAt: { lte: new Date() } },
      take: 20,
    });
    const transporter = this.transporter();

    for (const email of pending) {
      try {
        if (transporter) {
          await transporter.sendMail({
            from: config.smtpFrom,
            to: email.toAddress,
            subject: email.subject,
            text: email.body,
          });
        } else {
          this.logger.log(`[EMAIL simificado → ${email.toAddress}] ${email.subject}\n${email.body}`);
        }
        await this.prisma.emailOutbox.update({
          where: { id: email.id },
          data: { status: 'SENT', sentAt: new Date(), error: null },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.emailOutbox.update({
          where: { id: email.id },
          data: {
            attempts: { increment: 1 },
            error: message.slice(0, 500),
            nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
            status: 'PENDING',
          },
        });
      }
    }
  }
}
