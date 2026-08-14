import { jwtVerify } from 'jose';

// Reads and verifies the admin_token cookie, returning its payload
// ({ userId, username }) or null. Used by route handlers that need to know
// which user is making the request (middleware only verifies the token).
export async function getCurrentUser(request) {
  const token = request.cookies.get('admin_token')?.value;
  if (!token || !process.env.JWT_SECRET) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
    return payload;
  } catch {
    return null;
  }
}
