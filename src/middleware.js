import { NextResponse } from 'next/server';

export function middleware(request) {
  // Check for the admin token cookie
  const token = request.cookies.get('admin_token');

  if (!token) {
    // If no token and trying to access protected route, redirect to login
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Allow access if token exists
  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    '/admin',
    '/api/gmail/:path*'
  ],
};
