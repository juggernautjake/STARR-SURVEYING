import { NextRequest, NextResponse } from 'next/server';

// Define the shape of incoming form data (handles multiple naming conventions)
interface IncomingFormData {
  // Standard naming (from contact page and home page)
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  propertyAddress?: string;
  serviceType?: string;
  projectDetails?: string;
  preferredContact?: string;
  howHeard?: string;
  
  // Alternative naming (from ContactForm component)
  full_name?: string;
  company_name?: string;
  service_type?: string;
  property_address?: string;
  project_description?: string;
  preferred_contact_method?: string;
  how_heard?: string;
  
  // Calculator-specific fields
  subject?: string;
  message?: string;
  source?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: IncomingFormData = await request.json();

    // Normalize field names (handle both naming conventions)
    const name = body.name || body.full_name || '';
    const email = body.email || '';
    const phone = body.phone || '';
    const company = body.company || body.company_name || '';
    const propertyAddress = body.propertyAddress || body.property_address || '';
    const serviceType = body.serviceType || body.service_type || '';
    const projectDetails = body.projectDetails || body.project_description || '';
    const preferredContact = body.preferredContact || body.preferred_contact_method || 'email';
    const howHeard = body.howHeard || body.how_heard || '';
    const source = body.source || 'contact-form';
    const subject = body.subject || '';
    const message = body.message || '';

    // Validate required fields
    if (!name || !email || !phone) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required fields',
          error: 'Please fill in all required fields (name, email, phone).',
        },
        { status: 400 }
      );
    }

    // Format the email content
    let emailBody = '';
    let emailSubject = '';

    if (source === 'pricing-calculator') {
      // Calculator submission - use pre-formatted message
      emailSubject = subject || `Survey Estimate Request from ${name}`;
      emailBody = message;
    } else {
      // Regular contact form submission
      emailSubject = `New Contact Form Submission from ${name}`;
      emailBody = `
NEW CONTACT FORM SUBMISSION
============================

CONTACT INFORMATION:
--------------------
Name: ${name}
Email: ${email}
Phone: ${phone}
Company: ${company || 'Not provided'}
Preferred Contact: ${preferredContact}

PROPERTY INFORMATION:
--------------------
Address: ${propertyAddress || 'Not provided'}
Service Type: ${serviceType || 'Not specified'}

PROJECT DETAILS:
--------------------
${projectDetails || 'No details provided'}

How They Heard About Us: ${howHeard || 'Not specified'}

--------------------
Submitted: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}
Source: Website Contact Form
      `.trim();
    }

    // Send via Mailgun
    const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
    const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
    const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'info@starr-surveying.com';

    // Check if Mailgun is configured
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || 
        MAILGUN_API_KEY === 'your_actual_key' || 
        MAILGUN_DOMAIN === 'your_actual_domain') {
      // Mailgun not configured - log and return success for development
      console.log('='.repeat(60));
      console.log('MAILGUN NOT CONFIGURED - Email would be sent:');
      console.log('='.repeat(60));
      console.log('To:', BUSINESS_EMAIL);
      console.log('From:', `Starr Surveying Website <noreply@${MAILGUN_DOMAIN || 'mg.starr-surveying.com'}>`);
      console.log('Reply-To:', email);
      console.log('Subject:', emailSubject);
      console.log('-'.repeat(60));
      console.log(emailBody);
      console.log('='.repeat(60));

      return NextResponse.json(
        {
          success: true,
          message: 'Form received (email service not configured - check server logs)',
        },
        { status: 200 }
      );
    }

    // Send the email via Mailgun API
    const mailgunResponse = await fetch(
      `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          from: `Starr Surveying Website <noreply@${MAILGUN_DOMAIN}>`,
          to: BUSINESS_EMAIL,
          'h:Reply-To': email,
          subject: emailSubject,
          text: emailBody,
        }),
      }
    );

    if (!mailgunResponse.ok) {
      const errorText = await mailgunResponse.text();
      console.error('Mailgun API error:', mailgunResponse.status, errorText);
      
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to send email. Please try again or call us directly.',
          error: `Email service error: ${mailgunResponse.status}`,
        },
        { status: 500 }
      );
    }

    // Success!
    const mailgunResult = await mailgunResponse.json();
    console.log('Email sent successfully:', mailgunResult);

    return NextResponse.json(
      {
        success: true,
        message: 'Thank you for your submission! We will contact you within 24 business hours.',
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'An error occurred processing your request. Please try again or call us directly.',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { 
      status: 'ok',
      message: 'Contact API is running',
      timestamp: new Date().toISOString(),
    }, 
    { status: 200 }
  );
}