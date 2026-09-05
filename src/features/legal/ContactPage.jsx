import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Briefcase, MessageCircle, Send, CheckCircle2 } from 'lucide-react'
import Seo from '../../components/common/Seo'
import { Field, TextInput, Textarea } from '../../components/common/form'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'
import { submitContactMessage } from '../../services/contactService'
import { BUSINESS_INFO, isConfigured } from '../../config/businessConfig'

const GRID_COLS = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }

const schema = z.object({
  name: z.string().min(1, 'Please enter your name'),
  email: z.string().email('Enter a valid email'),
  subject: z.string().min(1, 'Please enter a subject'),
  message: z.string().min(1, 'Please enter a message'),
})

function ContactCard({ icon: Icon, title, value, href }) {
  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="card flex items-center gap-3 p-4 transition hover:shadow-md"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-400">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-soft">{title}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </a>
  )
}

export default function ContactPage() {
  const [sent, setSent] = useState(false)
  const toast = useToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async (values) => {
    try {
      // Only resolves once the row is actually written to the database —
      // this never claims success without a real submission.
      await submitContactMessage(values)
      setSent(true)
      reset()
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to send your message right now. Please try again.'))
    }
  }

  const cards = [
    isConfigured(BUSINESS_INFO.supportEmail) && {
      icon: Mail,
      title: 'Customer Support',
      value: BUSINESS_INFO.supportEmail,
      href: `mailto:${BUSINESS_INFO.supportEmail}`,
    },
    isConfigured(BUSINESS_INFO.businessEmail) && {
      icon: Briefcase,
      title: 'Business Enquiries',
      value: BUSINESS_INFO.businessEmail,
      href: `mailto:${BUSINESS_INFO.businessEmail}`,
    },
    isConfigured(BUSINESS_INFO.whatsappNumber) && {
      icon: MessageCircle,
      title: 'WhatsApp',
      value: `+${BUSINESS_INFO.whatsappNumber}`,
      href: `https://wa.me/${BUSINESS_INFO.whatsappNumber}`,
    },
  ].filter(Boolean)

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      <Seo
        title="Contact MoneyFlow"
        description="Contact MoneyFlow support for help with your account, subscription, payments, or questions."
      />

      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">How can we help?</h1>
        <p className="mt-3 text-base text-ink-soft">
          Have a question about MoneyFlow, subscriptions, payments, or your account? We&apos;re here to help.
        </p>
      </div>

      {cards.length > 0 && (
        <div className={`mx-auto mt-10 grid max-w-3xl gap-4 ${GRID_COLS[Math.min(cards.length, 3)]}`}>
          {cards.map((c) => (
            <ContactCard key={c.title} {...c} />
          ))}
        </div>
      )}

      <div className="mx-auto mt-12 max-w-xl">
        <div className="card p-6 sm:p-8">
          {sent ? (
            <div className="flex flex-col items-center py-6 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-success/12 text-success">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <h2 className="mt-3 text-lg font-bold">Message sent</h2>
              <p className="mt-1 text-sm text-ink-soft">Thanks for reaching out — we&apos;ll get back to you soon.</p>
              <button className="btn-ghost mt-4" onClick={() => setSent(false)}>
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" error={errors.name?.message}>
                  <TextInput {...register('name')} autoComplete="name" />
                </Field>
                <Field label="Email" error={errors.email?.message}>
                  <TextInput type="email" {...register('email')} autoComplete="email" />
                </Field>
              </div>
              <Field label="Subject" error={errors.subject?.message}>
                <TextInput {...register('subject')} />
              </Field>
              <Field label="Message" error={errors.message?.message}>
                <Textarea {...register('message')} rows={5} />
              </Field>
              <button type="submit" className="btn-primary w-full justify-center" disabled={isSubmitting}>
                <Send className="h-4 w-4" />
                {isSubmitting ? 'Sending…' : 'Send message'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
