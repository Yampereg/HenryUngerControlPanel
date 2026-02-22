import { NextRequest, NextResponse } from 'next/server'

// POST /api/send-email
// Authentication: x-panel-token header must match PANEL_API_TOKEN env var.
// Body JSON:
//   to                  — recipient address
//   subject             — email subject
//   text                — plain-text body
//   attachmentContent?  — raw string to attach (will be base64-encoded)
//   attachmentFilename? — filename for the attachment (default: output.txt)
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-panel-token')
  if (!token || token !== process.env.PANEL_API_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    to:                  string
    subject:             string
    text:                string
    attachmentContent?:  string
    attachmentFilename?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.to || !body.subject || !body.text) {
    return NextResponse.json({ error: 'to, subject and text are required' }, { status: 400 })
  }

  const resendKey  = process.env.RESEND_API_KEY
  const fromEmail  = process.env.RESEND_FROM_EMAIL ?? 'noreply@yourdomain.com'

  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const payload: Record<string, unknown> = {
    from:    fromEmail,
    to:      [body.to],
    subject: body.subject,
    text:    body.text,
  }

  if (body.attachmentContent) {
    payload.attachments = [
      {
        filename: body.attachmentFilename ?? 'output.txt',
        content:  Buffer.from(body.attachmentContent).toString('base64'),
      },
    ]
  }

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text()
    return NextResponse.json(
      { error: `Resend error ${res.status}: ${errText}` },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}
