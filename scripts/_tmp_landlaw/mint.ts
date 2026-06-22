import { encode } from 'next-auth/jwt';
(async () => {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET!;
  const salt = 'authjs.session-token';
  const now = Math.floor(Date.now() / 1000);
  const token = {
    email: 'jacobmaddux96@gmail.com',
    name: 'Jacob Maddux',
    roles: ['admin'],
    role: 'admin',
    rolesLastChecked: now,
    sub: 'jacobmaddux96@gmail.com',
  };
  const jwt = await encode({ token, secret, salt, maxAge: 30 * 24 * 60 * 60 });
  console.log(jwt);
})();
