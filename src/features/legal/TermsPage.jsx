import { Link } from 'react-router-dom'
import LegalPageLayout from './components/LegalPageLayout'
import { BUSINESS_INFO, isConfigured } from '../../config/businessConfig'

const brand = BUSINESS_INFO.brandName

export default function TermsPage() {
  const sections = [
    {
      id: 'introduction',
      heading: '1. Introduction',
      content: [
        `These Terms & Conditions ("Terms") govern your access to and use of ${brand} (the "Service"), a web application for personal financial tracking and management. By creating an account or using the Service, you agree to these Terms.`,
      ],
    },
    {
      id: 'acceptance',
      heading: '2. Acceptance of Terms',
      content: [
        'By registering for an account, or by otherwise accessing or using the Service, you confirm that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree, please do not use the Service.',
      ],
    },
    {
      id: 'description',
      heading: '3. Description of MoneyFlow',
      content: [
        `${brand} lets you record and organise your own financial information — accounts, income and expense transactions, budgets, savings goals, bills and recurring payments, and money you have personally lent to or borrowed from other people. All financial data shown in the Service is information you enter yourself; ${brand} does not connect to your bank accounts, cards, or any external financial institution on your behalf.`,
      ],
    },
    {
      id: 'eligibility',
      heading: '4. Eligibility',
      content: [
        'You must be able to form a legally binding contract to use the Service. If you are using the Service on behalf of yourself as an individual, you are responsible for ensuring your use complies with applicable laws in your jurisdiction.',
      ],
    },
    {
      id: 'accounts',
      heading: '5. User Accounts',
      content: [
        'You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us promptly if you suspect any unauthorised use of your account.',
        'You may sign in using an email and password, or using Google sign-in, depending on what is enabled for your account.',
      ],
    },
    {
      id: 'acceptable-use',
      heading: '6. Acceptable Use',
      content: [
        {
          bullets: [
            'You will not attempt to gain unauthorised access to any part of the Service, another user’s data, or the systems supporting the Service.',
            'You will not use the Service for any unlawful purpose or in a way that could damage, disable, or impair the Service.',
            'You will not attempt to reverse engineer, scrape, or resell the Service without our permission.',
          ],
        },
      ],
    },
    {
      id: 'responsibilities',
      heading: '7. User Responsibilities',
      content: [
        `You are solely responsible for the accuracy of the financial information you enter into ${brand}. The Service organises and displays the data you provide; it does not independently verify amounts, dates, or balances against any bank or third party.`,
      ],
    },
    {
      id: 'plans',
      heading: '8. Subscription Plans',
      content: [
        <>
          {brand} offers a Free plan with certain usage limits, and a Pro plan with expanded or unlimited usage and
          additional features. Current plan details, limits, and pricing are shown on our{' '}
          <Link to="/pricing" className="font-medium text-brand-700 underline dark:text-brand-400">
            Pricing page
          </Link>
          .
        </>,
        'The specific limits and features included in each plan may be updated from time to time; the plan details shown at the time of your subscription, and any change communicated to you, will govern your access.',
      ],
    },
    {
      id: 'payments',
      heading: '9. Payments and Billing',
      content: [
        'Paid plans are billed on a recurring monthly or yearly basis, as selected at checkout. Payments are processed by Razorpay, our third-party payment gateway; we do not collect or store your full card, UPI, or bank account details ourselves.',
        'Your subscription renews automatically at the end of each billing period unless you cancel before the renewal date.',
      ],
    },
    {
      id: 'custom-plans',
      heading: '10. Custom Plans',
      content: [
        `${brand} may, at its discretion, offer a negotiated Custom plan to a specific user — either in response to a request you submit, or as an offer we create for you directly. A Custom plan offer shows a specific price and billing cycle and remains valid only until any expiry date shown with the offer. Any negotiation of price (for example, over WhatsApp) is not binding until it is reflected as an updated offer in your account and accepted by you through the Service.`,
      ],
    },
    {
      id: 'cancellation',
      heading: '11. Cancellation',
      content: [
        'You may cancel your subscription at any time from your account settings. Cancelling stops future renewals; it does not retroactively end the billing period you have already paid for. You will continue to have access to your plan’s features until the end of the current billing period.',
      ],
    },
    {
      id: 'refunds',
      heading: '12. Refunds',
      content: [
        <>
          Refunds, where applicable, are handled in accordance with our{' '}
          <Link to="/refund-policy" className="font-medium text-brand-700 underline dark:text-brand-400">
            Cancellation &amp; Refund Policy
          </Link>
          .
        </>,
      ],
    },
    {
      id: 'third-party',
      heading: '13. Third-Party Services',
      content: [
        `The Service relies on third-party providers to operate — including Supabase for authentication and data storage, and Razorpay for payment processing. Your use of features that involve these providers is also subject to their respective terms and policies.`,
      ],
    },
    {
      id: 'disclaimer',
      heading: '14. Financial Information Disclaimer',
      content: [
        `${brand} is a personal financial tracking and organisation tool only. ${brand} is NOT a bank, a lender, a payment processor, an investment adviser, a financial adviser, or a tax adviser, and nothing in the Service constitutes financial, investment, legal, or tax advice. Decisions you make based on information shown in the Service are your own responsibility.`,
      ],
    },
    {
      id: 'availability',
      heading: '15. Service Availability',
      content: [
        'We aim to keep the Service available and reliable, but we do not guarantee uninterrupted or error-free operation. The Service may be temporarily unavailable for maintenance, updates, or reasons outside our control.',
      ],
    },
    {
      id: 'ip',
      heading: '16. Intellectual Property',
      content: [
        `The ${brand} name, logo, and the Service's software, design, and content (excluding data you provide) are owned by ${brand} or its licensors. You may not copy, modify, or distribute them without permission.`,
      ],
    },
    {
      id: 'liability',
      heading: '17. Limitation of Liability',
      content: [
        `To the maximum extent permitted by law, ${brand} shall not be liable for any indirect, incidental, or consequential damages arising from your use of, or inability to use, the Service, including any financial decisions made based on information recorded in the Service.`,
      ],
    },
    {
      id: 'changes-service',
      heading: '18. Changes to the Service',
      content: [
        'We may add, change, or remove features of the Service over time, including plan limits and pricing, to improve or maintain the Service.',
      ],
    },
    {
      id: 'changes-terms',
      heading: '19. Changes to These Terms',
      content: [
        'We may update these Terms from time to time. Material changes will be reflected by an updated "Last updated" date on this page. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.',
      ],
    },
    {
      id: 'contact',
      heading: '20. Contact Information',
      content: [
        isConfigured(BUSINESS_INFO.supportEmail)
          ? `Questions about these Terms can be sent to ${BUSINESS_INFO.supportEmail}, or via our Contact page.`
          : 'Questions about these Terms can be sent to us via our Contact page.',
      ],
    },
  ]

  return (
    <LegalPageLayout
      title="Terms & Conditions"
      description="Please read these terms carefully before using MoneyFlow."
      sections={sections}
    />
  )
}
