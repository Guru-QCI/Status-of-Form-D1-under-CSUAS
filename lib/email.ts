import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = process.env.RESEND_FROM ?? 'noreply@example.com'

export async function sendReminderEmail(
  to: string[],
  subject: string,
  body: string,
): Promise<void> {
  await resend.emails.send({ from: FROM, to, subject, text: body })
}
