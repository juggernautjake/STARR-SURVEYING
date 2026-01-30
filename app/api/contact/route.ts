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
    let emailSubject = '';
    let emailText = '';
    let emailHtml = '';

    if (source === 'pricing-calculator') {
      // Calculator submission - use pre-formatted message
      emailSubject = subject || `Survey Estimate Request from ${name}`;
      emailText = message;
      emailHtml = `<pre style="font-family: monospace; white-space: pre-wrap;">${message}</pre>`;
    } else {
      // Regular contact form submission
      emailSubject = `New Contact Form Submission from ${name}`;
      emailText = `
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

      emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1D3095; color: white; padding: 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .section { background: #f9f9f9; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .section h2 { color: #1D3095; font-size: 16px; margin-top: 0; border-bottom: 2px solid #C41E3A; padding-bottom: 5px; }
    .field { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .value { color: #333; }
    .footer { text-align: center; font-size: 12px; color: #888; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📧 New Contact Form Submission</h1>
    </div>
    
    <div class="section">
      <h2>Contact Information</h2>
      <div class="field"><span class="label">Name:</span> <span class="value">${name}</span></div>
      <div class="field"><span class="label">Email:</span> <span class="value"><a href="mailto:${email}">${email}</a></span></div>
      <div class="field"><span class="label">Phone:</span> <span class="value"><a href="tel:${phone}">${phone}</a></span></div>
      <div class="field"><span class="label">Company:</span> <span class="value">${company || 'Not provided'}</span></div>
      <div class="field"><span class="label">Preferred Contact:</span> <span class="value">${preferredContact}</span></div>
    </div>
    
    <div class="section">
      <h2>Property Information</h2>
      <div class="field"><span class="label">Address:</span> <span class="value">${propertyAddress || 'Not provided'}</span></div>
      <div class="field"><span class="label">Service Type:</span> <span class="value">${serviceType || 'Not specified'}</span></div>
    </div>
    
    <div class="section">
      <h2>Project Details</h2>
      <p>${projectDetails || 'No details provided'}</p>
    </div>
    
    <div class="section">
      <h2>Additional Info</h2>
      <div class="field"><span class="label">How They Heard About Us:</span> <span class="value">${howHeard || 'Not specified'}</span></div>
    </div>
    
    <div class="footer">
      <p>Submitted: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}</p>
      <p>Source: Website Contact Form</p>
    </div>
  </div>
</body>
</html>
      `.trim();
    }

    // Send via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'info@starr-surveying.com';

    // Check if Resend is configured
    if (!RESEND_API_KEY || RESEND_API_KEY === 'your_resend_api_key') {
      // Resend not configured - log and return success for development
      console.log('='.repeat(60));
      console.log('RESEND NOT CONFIGURED - Email would be sent:');
      console.log('='.repeat(60));
      console.log('To:', BUSINESS_EMAIL);
      console.log('From: Starr Surveying Website <noreply@starr-surveying.com>');
      console.log('Reply-To:', email);
      console.log('Subject:', emailSubject);
      console.log('-'.repeat(60));
      console.log(emailText);
      console.log('='.repeat(60));

      return NextResponse.json(
        {
          success: true,
          message: 'Form received (email service not configured - check server logs)',
        },
        { status: 200 }
      );
    }

    // Send the email via Resend API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Starr Surveying Website <noreply@starr-surveying.com>',
        to: [BUSINESS_EMAIL],
        reply_to: email,
        subject: emailSubject,
        text: emailText,
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json();
      console.error('Resend API error:', resendResponse.status, errorData);
      
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to send email. Please try again or call us directly.',
          error: `Email service error: ${resendResponse.status}`,
        },
        { status: 500 }
      );
    }

    // Success!
    const resendResult = await resendResponse.json();
    console.log('Email sent successfully via Resend:', resendResult);

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
      message: 'Contact API is running (Resend)',
      timestamp: new Date().toISOString(),
    }, 
    { status: 200 }
  );
}