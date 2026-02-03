-- Criar usuário admin: daniel@tatica.com / abc123
-- Hash Argon2 válido para senha 'abc123'

INSERT INTO "User" (
  name,
  email,
  password,
  role,
  status,
  "oneToOneActive",
  "isActive",
  "createdAt",
  "updatedAt"
) VALUES (
  'Daniel',
  'daniel@tatica.com',
  '$argon2id$v=19$m=65536,t=3,p=4$ZnXaIapEk0ehIMbgzmnFaA$PFER3Z0KxQlZGlMukwSeS/jhKWRH1fxw+EqE9RK+Pr4',
  'admin',
  'Offline',
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  password = '$argon2id$v=19$m=65536,t=3,p=4$ZnXaIapEk0ehIMbgzmnFaA$PFER3Z0KxQlZGlMukwSeS/jhKWRH1fxw+EqE9RK+Pr4',
  role = 'admin',
  "isActive" = true;
