import { z } from 'zod'

export const RegisterSchema = z.object({
  name: z
    .string()
    .min(2, 'İsim en az 2 karakter olmalı')
    .max(50, 'İsim en fazla 50 karakter olabilir'),
  email: z.string().email('Geçerli bir email adresi girin'),
  password: z
    .string()
    .min(8, 'Şifre en az 8 karakter olmalı')
    .regex(/[A-Z]/, 'Şifre en az bir büyük harf içermeli')
    .regex(/[0-9]/, 'Şifre en az bir rakam içermeli'),
})

export const LoginSchema = z.object({
  email: z.string().email('Geçerli bir email adresi girin'),
  password: z.string().min(1, 'Şifre boş olamaz'),
})

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Geçerli bir email adresi girin'),
})

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, 'Şifre en az 8 karakter olmalı')
    .regex(/[A-Z]/, 'Şifre en az bir büyük harf içermeli')
    .regex(/[0-9]/, 'Şifre en az bir rakam içermeli'),
})

// Tip üretimi — ayrıca interface yazmaya gerek yok
export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>
