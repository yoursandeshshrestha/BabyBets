import { useState, type FormEvent } from 'react'
import { Mail, Clock, Instagram, Facebook, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import Header from '@/components/common/Header'
import Footer from '@/components/common/Footer'

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const html = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${formData.name}</p>
      <p><strong>Email:</strong> ${formData.email}</p>
      <p><strong>Subject:</strong> ${formData.subject}</p>
      <p><strong>Message:</strong></p>
      <p>${formData.message.replace(/\n/g, '<br />')}</p>
    `

    const text = `New Contact Form Submission\n\nName: ${formData.name}\nEmail: ${formData.email}\nSubject: ${formData.subject}\nMessage:\n${formData.message}`

    try {
      const { data, error } = await supabase.functions.invoke('send-contact-form', {
        body: { name: formData.name, email: formData.email, subject: formData.subject, message: formData.message }
      })

      if (error) throw error

      if (data?.success) {
        toast.success("Message sent! We'll get back to you as soon as possible.")
        setFormData({ name: '', email: '', subject: '', message: '' })
      } else {
        toast.error('Something went wrong. Please try emailing us directly.')
      }
    } catch (error) {
      console.error('Contact form error:', error)
      toast.error('Something went wrong. Please try emailing us directly at hello@babybets.co.uk')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputStyle = {
    borderColor: '#e7e5e4',
    color: '#2D251E',
  }

  const focusRing = 'focus:outline-none focus:ring-2 focus:ring-[#496B71]/30 focus:border-[#496B71]'

  return (
    <div className="antialiased relative min-h-screen" style={{ color: '#2D251E', backgroundColor: '#fffbf7' }}>
      <Header />

      <div className="py-12 sm:py-16 md:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-12 md:mb-16">
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 sm:mb-4"
              style={{ fontFamily: "'Fraunces', serif", color: '#151e20' }}
            >
              Contact Us
            </h1>
            <p className="text-base sm:text-lg max-w-xl mx-auto" style={{ color: '#78716c' }}>
              Have a question or need help? Send us a message and our team will get back to you.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
            {/* Contact Form */}
            <div className="lg:col-span-3">
              <div
                className="rounded-xl sm:rounded-2xl p-6 sm:p-8 md:p-10"
                style={{
                  backgroundColor: 'white',
                  borderWidth: '1px',
                  borderColor: '#e7e5e4',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                }}
              >
                <h2
                  className="text-xl sm:text-2xl font-bold mb-6"
                  style={{ fontFamily: "'Fraunces', serif", color: '#151e20' }}
                >
                  Send a Message
                </h2>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium mb-1.5" style={{ color: '#151e20' }}>
                        Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Your name"
                        className={`w-full rounded-lg border px-4 py-2.5 text-sm transition-colors ${focusRing}`}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium mb-1.5" style={{ color: '#151e20' }}>
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="you@example.com"
                        className={`w-full rounded-lg border px-4 py-2.5 text-sm transition-colors ${focusRing}`}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium mb-1.5" style={{ color: '#151e20' }}>
                      Subject
                    </label>
                    <input
                      type="text"
                      id="subject"
                      name="subject"
                      required
                      value={formData.subject}
                      onChange={handleChange}
                      placeholder="What is this about?"
                      className={`w-full rounded-lg border px-4 py-2.5 text-sm transition-colors ${focusRing}`}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium mb-1.5" style={{ color: '#151e20' }}>
                      Message
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      required
                      rows={5}
                      value={formData.message}
                      onChange={handleChange}
                      placeholder="How can we help?"
                      className={`w-full rounded-lg border px-4 py-2.5 text-sm transition-colors resize-vertical ${focusRing}`}
                      style={inputStyle}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
                    style={{ backgroundColor: '#496B71' }}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        Send Message
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Contact Information */}
            <div className="lg:col-span-2">
              <div className="space-y-6">
                <div
                  className="rounded-xl sm:rounded-2xl p-6 sm:p-8"
                  style={{
                    backgroundColor: 'white',
                    borderWidth: '1px',
                    borderColor: '#e7e5e4',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <h2
                    className="text-xl sm:text-2xl font-bold mb-6"
                    style={{ fontFamily: "'Fraunces', serif", color: '#151e20' }}
                  >
                    Get in Touch
                  </h2>

                  <div className="space-y-5">
                    <div className="flex items-start gap-4">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: 'rgba(73, 107, 113, 0.1)' }}
                      >
                        <Mail size={18} style={{ color: '#496B71' }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-0.5" style={{ color: '#151e20' }}>Email</p>
                        <a
                          href="mailto:hello@babybets.co.uk"
                          className="text-sm transition-opacity hover:opacity-80 cursor-pointer"
                          style={{ color: '#496B71' }}
                        >
                          hello@babybets.co.uk
                        </a>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: 'rgba(73, 107, 113, 0.1)' }}
                      >
                        <Clock size={18} style={{ color: '#496B71' }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-0.5" style={{ color: '#151e20' }}>Support Hours</p>
                        <p className="text-sm" style={{ color: '#78716c' }}>Monday - Friday</p>
                        <p className="text-sm" style={{ color: '#78716c' }}>9:00 AM - 5:00 PM (GMT)</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-xl sm:rounded-2xl p-6 sm:p-8"
                  style={{
                    backgroundColor: 'white',
                    borderWidth: '1px',
                    borderColor: '#e7e5e4',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <h3
                    className="text-lg font-bold mb-4"
                    style={{ fontFamily: "'Fraunces', serif", color: '#151e20' }}
                  >
                    Follow Us
                  </h3>

                  <div className="flex gap-3">
                    <a
                      href="https://www.instagram.com/babybetsofficial/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity hover:opacity-80 cursor-pointer"
                      style={{ backgroundColor: '#496B71' }}
                      aria-label="Follow BabyBets on Instagram"
                    >
                      <Instagram size={18} color="#ffffff" />
                    </a>
                    <a
                      href="https://www.facebook.com/babybetsofficial"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity hover:opacity-80 cursor-pointer"
                      style={{ backgroundColor: '#496B71' }}
                      aria-label="Follow BabyBets on Facebook"
                    >
                      <Facebook size={18} color="#ffffff" />
                    </a>
                    <a
                      href="https://www.tiktok.com/@babybetsofficial"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity hover:opacity-80 cursor-pointer"
                      style={{ backgroundColor: '#496B71' }}
                      aria-label="Follow BabyBets on TikTok"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                      </svg>
                    </a>
                  </div>
                </div>

                <div
                  className="rounded-xl sm:rounded-2xl p-6 sm:p-8"
                  style={{
                    backgroundColor: 'rgba(73, 107, 113, 0.05)',
                    borderWidth: '1px',
                    borderColor: '#e7e5e4',
                  }}
                >
                  <p className="text-sm leading-relaxed" style={{ color: '#78716c' }}>
                    <strong style={{ color: '#151e20' }}>BabyBets</strong> is a registered UK company.
                    <br />
                    Company number: 16963672
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
