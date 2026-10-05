export interface LoginValidation {
  email?: string;
  password?: string;
}

export function validateLogin(email: string, password: string): LoginValidation {
  const errors: LoginValidation = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}
