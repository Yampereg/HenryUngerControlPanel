import { NextRequest, NextResponse } from 'next/server'

const PANEL_TOKEN  = process.env.PANEL_TOKEN   // undefined → open (no auth)
const COOKIE_NAME  = 'panel-token'
const COOKIE_TTL   = 60 * 60 * 24              // 24 hours

export function middleware(request: NextRequest) {
  // If no token is configured, the panel is open (trusted network / dev)
  if (!PANEL_TOKEN) return NextResponse.next()

  // 1. Valid cookie already present → pass through
  const cookieVal = request.cookies.get(COOKIE_NAME)?.value
  if (cookieVal === PANEL_TOKEN) return NextResponse.next()

  // 2. Token supplied in URL query param (first visit from the website)
  const urlToken = request.nextUrl.searchParams.get('token')
  if (urlToken === PANEL_TOKEN) {
    // Strip token from URL so it doesn't linger in the address bar
    const cleanUrl = request.nextUrl.clone()
    cleanUrl.searchParams.delete('token')
    const res = NextResponse.redirect(cleanUrl)
    res.cookies.set(COOKIE_NAME, PANEL_TOKEN, {
      httpOnly: true,
      sameSite: 'none',  // required for cross-site iframe
      secure:   true,    // sameSite=none requires Secure
      maxAge:   COOKIE_TTL,
      path:     '/',
    })
    return res
  }

  // 3. No valid credentials → 403
  return new NextResponse(
    '<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0f;color:#9ca3af"><p>403 · Unauthorized</p></body></html>',
    { status: 403, headers: { 'Content-Type': 'text/html' } },
  )
}

export const config = {
  // Apply to all routes except Next.js internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
