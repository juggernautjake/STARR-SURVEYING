import { NextRequest, NextResponse } from 'next/server';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Email recipients - business notifications go to all of these
const EMAIL_RECIPIENTS = [
  'info@starr-surveying.com',
  'starrsurveying@yahoo.com',
];

// Company information
const COMPANY = {
  name: 'Starr Surveying',
  address: '3779 W FM 436, Belton, TX 76513',
  website: 'https://starr-surveying.com',
  logoUrl: 'https://starr-surveying.com/logos/starr_surveying_logo_aug_2024_alt.png',
  team: [
    { name: 'Henry "Hank" Maddux', title: 'RPLS #6706', phone: '(936) 662-0077', email: 'hankmaddux@starr-surveying.com' },
    { name: 'Jacob Maddux', title: 'Party Chief / Survey Technician', phone: '(254) 315-1123', email: 'jacobmaddux@starr-surveying.com' },
  ],
  proverb: '"Remove not the ancient landmark, which thy fathers have set." — Proverbs 22:28',
};

// Brand colors
const COLORS = {
  red: '#BD1218',
  blue: '#1D3095',
  darkBlue: '#152050',
  white: '#FFFFFF',
  lightGray: '#F8F9FA',
  gray: '#6B7280',
  darkGray: '#4B5563',
};

// =============================================================================
// TYPES
// =============================================================================

interface IncomingFormData {
  // Standard naming
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

interface NormalizedData {
  name: string;
  email: string;
  phone: string;
  company: string;
  propertyAddress: string;
  serviceType: string;
  projectDetails: string;
  preferredContact: string;
  howHeard: string;
  source: string;
  subject: string;
  message: string;
}

interface ParsedCalculatorData {
  surveyType: string;
  estimateRange: string;
  isRush: boolean;
  projectDetails: Array<{ label: string; value: string }>;
  userNotes: string;
}

// =============================================================================
// UNIQUE REFERENCE NUMBER GENERATOR
// =============================================================================

function generateReferenceNumber(): string {
  const now = new Date();
  const centralTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  
  const year = centralTime.getFullYear().toString().slice(-2);
  const month = (centralTime.getMonth() + 1).toString().padStart(2, '0');
  const day = centralTime.getDate().toString().padStart(2, '0');
  const hours = centralTime.getHours().toString().padStart(2, '0');
  const minutes = centralTime.getMinutes().toString().padStart(2, '0');
  const seconds = centralTime.getSeconds().toString().padStart(2, '0');
  
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randomSuffix = '';
  for (let i = 0; i < 3; i++) {
    randomSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return `SS-${year}${month}${day}-${hours}${minutes}${seconds}-${randomSuffix}`;
}

// =============================================================================
// CALCULATOR MESSAGE PARSER
// =============================================================================

function parseCalculatorMessage(message: string): ParsedCalculatorData {
  // Extract survey type
  const surveyTypeMatch = message.match(/Survey Type: ([^\n]+)/);
  const surveyType = surveyTypeMatch ? surveyTypeMatch[1].trim() : 'Survey';
  
  // Extract estimate range
  const estimateMatch = message.match(/Estimated Range: (\$[\d,]+ - \$[\d,]+)/);
  const estimateRange = estimateMatch ? estimateMatch[1] : 'See details';
  
  // Check for rush job
  const isRush = message.includes('Rush Job: Yes');
  
  // Extract user notes - these come right after "ADDITIONAL NOTES:" and before "SURVEY ESTIMATE REQUEST"
  let userNotes = '';
  const notesMatch = message.match(/ADDITIONAL NOTES:\n([\s\S]*?)(?=\n\nSURVEY ESTIMATE REQUEST|\n\n[A-Z])/);
  if (notesMatch && notesMatch[1]) {
    userNotes = notesMatch[1].trim();
    if (userNotes.toLowerCase() === 'none' || userNotes === '') {
      userNotes = '';
    }
  }
  
  // Extract project details from the PROJECT DETAILS section
  const projectDetails: Array<{ label: string; value: string }> = [];
  const detailsMatch = message.match(/PROJECT DETAILS:[\s-]*\n([\s\S]*?)(?=\n\nSubmitted:|$)/);
  
  if (detailsMatch && detailsMatch[1]) {
    const lines = detailsMatch[1].split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && trimmed.includes(':') && !trimmed.startsWith('-')) {
        const colonIndex = trimmed.indexOf(':');
        const label = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();
        if (label && value && !label.includes('---')) {
          projectDetails.push({ label, value });
        }
      }
    }
  }
  
  return {
    surveyType,
    estimateRange,
    isRush,
    projectDetails,
    userNotes,
  };
}

// =============================================================================
// HTML EMAIL STYLES
// =============================================================================

function getEmailStyles(): string {
  return `
    body { 
      margin: 0; 
      padding: 0; 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      background-color: ${COLORS.lightGray}; 
      color: #333;
    }
    .email-wrapper {
      max-width: 650px;
      margin: 0 auto;
      background-color: ${COLORS.white};
    }
    .header {
      background: linear-gradient(135deg, ${COLORS.red} 0%, ${COLORS.blue} 100%);
      padding: 30px 20px;
      text-align: center;
    }
    .header img {
      max-height: 80px;
      width: auto;
    }
    .header-title {
      color: ${COLORS.white};
      font-size: 24px;
      font-weight: bold;
      margin: 15px 0 5px 0;
      text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }
    .header-subtitle {
      color: rgba(255,255,255,0.9);
      font-size: 14px;
      margin: 0;
    }
    .reference-bar {
      background-color: ${COLORS.darkBlue};
      padding: 12px 20px;
      text-align: center;
    }
    .reference-label {
      color: rgba(255,255,255,0.7);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 0;
    }
    .reference-number {
      color: ${COLORS.white};
      font-size: 18px;
      font-weight: bold;
      font-family: 'Courier New', monospace;
      letter-spacing: 1px;
      margin: 5px 0 0 0;
    }
    .content {
      padding: 30px;
    }
    .greeting {
      font-size: 18px;
      color: ${COLORS.darkBlue};
      margin-bottom: 20px;
    }
    .section {
      background-color: ${COLORS.lightGray};
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      border-left: 4px solid ${COLORS.blue};
    }
    .section--red {
      border-left-color: ${COLORS.red};
    }
    .section-title {
      font-size: 14px;
      font-weight: bold;
      color: ${COLORS.blue};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 15px 0;
      padding-bottom: 8px;
      border-bottom: 2px solid ${COLORS.red};
    }
    .section-title--red {
      color: ${COLORS.red};
      border-bottom-color: ${COLORS.blue};
    }
    .field {
      margin-bottom: 12px;
    }
    .field:last-child {
      margin-bottom: 0;
    }
    .field-label {
      font-size: 11px;
      font-weight: bold;
      color: ${COLORS.gray};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }
    .field-value {
      font-size: 15px;
      color: #333;
      word-break: break-word;
    }
    .field-value a {
      color: ${COLORS.blue};
      text-decoration: none;
    }
    .field-value a:hover {
      text-decoration: underline;
    }
    .estimate-box {
      background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
      border: 2px solid #10B981;
      border-radius: 10px;
      padding: 20px;
      text-align: center;
      margin-bottom: 20px;
    }
    .estimate-label {
      font-size: 12px;
      color: #065F46;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 0 0 8px 0;
    }
    .estimate-range {
      font-size: 28px;
      font-weight: bold;
      color: #065F46;
      margin: 0;
    }
    .rush-badge {
      display: inline-block;
      background-color: #FEF3C7;
      color: #92400E;
      font-size: 12px;
      font-weight: bold;
      padding: 5px 12px;
      border-radius: 20px;
      margin-top: 10px;
      border: 1px solid #F59E0B;
    }
    .details-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .details-list li {
      padding: 8px 0;
      border-bottom: 1px solid #E5E7EB;
      font-size: 14px;
    }
    .details-list li:last-child {
      border-bottom: none;
    }
    .details-list strong {
      color: ${COLORS.darkBlue};
    }
    .notes-box {
      background-color: #FFF;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      padding: 15px;
      font-size: 14px;
      line-height: 1.6;
      white-space: pre-wrap;
      color: ${COLORS.darkGray};
    }
    .cta-section {
      text-align: center;
      padding: 20px 0;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, ${COLORS.red} 0%, ${COLORS.blue} 100%);
      color: #FFFFFF;
      font-size: 14px;
      font-weight: bold;
      padding: 12px 30px;
      border-radius: 6px;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, ${COLORS.blue}, ${COLORS.red}, transparent);
      margin: 25px 0;
    }
    .footer {
      background-color: ${COLORS.darkBlue};
      padding: 30px;
      text-align: center;
    }
    .footer-company {
      color: ${COLORS.white};
      font-size: 16px;
      font-weight: bold;
      margin: 0 0 5px 0;
    }
    .footer-address {
      color: rgba(255,255,255,0.7);
      font-size: 13px;
      margin: 0 0 20px 0;
    }
    .footer-team {
      margin-bottom: 20px;
    }
    .footer-person {
      display: inline-block;
      margin: 10px 20px;
      text-align: left;
    }
    .footer-person-name {
      color: ${COLORS.white};
      font-size: 14px;
      font-weight: bold;
      margin: 0;
    }
    .footer-person-title {
      color: rgba(255,255,255,0.6);
      font-size: 11px;
      margin: 2px 0;
    }
    .footer-person-contact {
      color: rgba(255,255,255,0.8);
      font-size: 12px;
      margin: 2px 0;
    }
    .footer-person-contact a {
      color: rgba(255,255,255,0.8);
      text-decoration: none;
    }
    .footer-proverb {
      color: rgba(255,255,255,0.6);
      font-size: 12px;
      font-style: italic;
      margin: 20px 0 0 0;
      padding-top: 15px;
      border-top: 1px solid rgba(255,255,255,0.2);
    }
    .footer-copyright {
      color: rgba(255,255,255,0.4);
      font-size: 11px;
      margin: 15px 0 0 0;
    }
    .timestamp {
      text-align: center;
      font-size: 12px;
      color: ${COLORS.gray};
      margin-top: 20px;
    }
  `;
}

function getEmailHeader(title: string, subtitle: string): string {
  return `
    <div class="header">
      <img src="${COMPANY.logoUrl}" alt="Starr Surveying" style="max-height: 80px; width: auto;">
      <p class="header-title">${title}</p>
      <p class="header-subtitle">${subtitle}</p>
    </div>
  `;
}

function getEmailFooter(): string {
  return `
    <div class="footer">
      <p class="footer-company">${COMPANY.name}</p>
      <p class="footer-address">${COMPANY.address}</p>
      
      <div class="footer-team">
        ${COMPANY.team.map(person => `
          <div class="footer-person">
            <p class="footer-person-name">${person.name}</p>
            <p class="footer-person-title">${person.title}</p>
            <p class="footer-person-contact">
              <a href="tel:${person.phone.replace(/\D/g, '')}">${person.phone}</a>
            </p>
            <p class="footer-person-contact">
              <a href="mailto:${person.email}">${person.email}</a>
            </p>
          </div>
        `).join('')}
      </div>
      
      <p class="footer-proverb">${COMPANY.proverb}</p>
      <p class="footer-copyright">© ${new Date().getFullYear()} ${COMPANY.name}. All rights reserved.</p>
    </div>
  `;
}

function getReferenceBar(referenceNumber: string): string {
  return `
    <div class="reference-bar">
      <p class="reference-label">Reference Number</p>
      <p class="reference-number">${referenceNumber}</p>
    </div>
  `;
}

// =============================================================================
// BUSINESS EMAIL TEMPLATE (Calculator)
// =============================================================================

function buildCalculatorEmailHtml(data: NormalizedData, referenceNumber: string): string {
  const parsed = parseCalculatorMessage(data.message);
  
  const timestamp = new Date().toLocaleString('en-US', { 
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  // Build project details list HTML
  const detailsListHtml = parsed.projectDetails
    .map(d => `<li><strong>${d.label}:</strong> ${d.value}</li>`)
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${getEmailStyles()}</style>
</head>
<body>
  <div class="email-wrapper">
    ${getEmailHeader('New Estimate Request', `${parsed.surveyType} - Website Calculator`)}
    ${getReferenceBar(referenceNumber)}
    
    <div class="content">
      <!-- Estimate Box -->
      <div class="estimate-box">
        <p class="estimate-label">Estimated Price Range</p>
        <p class="estimate-range">${parsed.estimateRange}</p>
        ${parsed.isRush ? '<span class="rush-badge">RUSH JOB REQUESTED</span>' : ''}
      </div>
      
      <!-- Contact Information -->
      <div class="section">
        <h2 class="section-title">Contact Information</h2>
        <div class="field">
          <div class="field-label">Name</div>
          <div class="field-value">${data.name}</div>
        </div>
        <div class="field">
          <div class="field-label">Email</div>
          <div class="field-value"><a href="mailto:${data.email}">${data.email}</a></div>
        </div>
        <div class="field">
          <div class="field-label">Phone</div>
          <div class="field-value"><a href="tel:${data.phone.replace(/\D/g, '')}">${data.phone}</a></div>
        </div>
      </div>
      
      <!-- Project Details -->
      <div class="section section--red">
        <h2 class="section-title section-title--red">Project Details</h2>
        <ul class="details-list">
          <li><strong>Survey Type:</strong> ${parsed.surveyType}</li>
          ${detailsListHtml}
        </ul>
      </div>
      
      ${parsed.userNotes ? `
      <!-- Additional Notes from Customer -->
      <div class="section">
        <h2 class="section-title">Additional Notes from Customer</h2>
        <div class="notes-box">${parsed.userNotes}</div>
      </div>
      ` : ''}
      
      <div class="divider"></div>
      
      <p class="timestamp">Submitted on ${timestamp} via Website Calculator</p>
    </div>
    
    ${getEmailFooter()}
  </div>
</body>
</html>
  `.trim();
}

// =============================================================================
// BUSINESS EMAIL TEMPLATE (Contact Form)
// =============================================================================

function buildContactFormEmailHtml(data: NormalizedData, referenceNumber: string): string {
  const timestamp = new Date().toLocaleString('en-US', { 
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${getEmailStyles()}</style>
</head>
<body>
  <div class="email-wrapper">
    ${getEmailHeader('New Contact Form Submission', 'Website Inquiry')}
    ${getReferenceBar(referenceNumber)}
    
    <div class="content">
      <!-- Contact Information -->
      <div class="section">
        <h2 class="section-title">Contact Information</h2>
        <div class="field">
          <div class="field-label">Name</div>
          <div class="field-value">${data.name}</div>
        </div>
        <div class="field">
          <div class="field-label">Email</div>
          <div class="field-value"><a href="mailto:${data.email}">${data.email}</a></div>
        </div>
        <div class="field">
          <div class="field-label">Phone</div>
          <div class="field-value"><a href="tel:${data.phone.replace(/\D/g, '')}">${data.phone}</a></div>
        </div>
        ${data.company ? `
        <div class="field">
          <div class="field-label">Company</div>
          <div class="field-value">${data.company}</div>
        </div>
        ` : ''}
        <div class="field">
          <div class="field-label">Preferred Contact Method</div>
          <div class="field-value">${data.preferredContact || 'Email'}</div>
        </div>
      </div>
      
      <!-- Property & Service -->
      <div class="section section--red">
        <h2 class="section-title section-title--red">Property & Service Information</h2>
        ${data.propertyAddress ? `
        <div class="field">
          <div class="field-label">Property Address</div>
          <div class="field-value">${data.propertyAddress}</div>
        </div>
        ` : ''}
        ${data.serviceType ? `
        <div class="field">
          <div class="field-label">Service Requested</div>
          <div class="field-value">${data.serviceType}</div>
        </div>
        ` : ''}
        ${data.howHeard ? `
        <div class="field">
          <div class="field-label">How They Found Us</div>
          <div class="field-value">${data.howHeard}</div>
        </div>
        ` : ''}
      </div>
      
      ${data.projectDetails ? `
      <!-- Project Details -->
      <div class="section">
        <h2 class="section-title">Project Details</h2>
        <div class="notes-box">${data.projectDetails}</div>
      </div>
      ` : ''}
      
      <div class="divider"></div>
      
      <p class="timestamp">Submitted on ${timestamp} via Contact Form</p>
    </div>
    
    ${getEmailFooter()}
  </div>
</body>
</html>
  `.trim();
}

// =============================================================================
// CUSTOMER CONFIRMATION EMAIL TEMPLATE
// =============================================================================

function buildCustomerConfirmationHtml(data: NormalizedData, referenceNumber: string, isCalculator: boolean): string {
  const timestamp = new Date().toLocaleString('en-US', { 
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  // For calculator submissions, include full estimate details
  let estimateSection = '';
  let projectDetailsSection = '';
  
  if (isCalculator && data.message) {
    const parsed = parseCalculatorMessage(data.message);
    
    estimateSection = `
      <div class="estimate-box">
        <p class="estimate-label">Your Estimated Price Range</p>
        <p class="estimate-range">${parsed.estimateRange}</p>
        <p style="color: #065F46; font-size: 14px; margin-top: 10px;">${parsed.surveyType}</p>
        ${parsed.isRush ? '<span class="rush-badge">RUSH JOB REQUESTED</span>' : ''}
      </div>
    `;
    
    // Build project details for customer email
    const detailsListHtml = parsed.projectDetails
      .map(d => `<li><strong>${d.label}:</strong> ${d.value}</li>`)
      .join('');
    
    projectDetailsSection = `
      <div class="section section--red">
        <h2 class="section-title section-title--red">Your Project Details</h2>
        <ul class="details-list">
          <li><strong>Survey Type:</strong> ${parsed.surveyType}</li>
          ${detailsListHtml}
        </ul>
      </div>
      ${parsed.userNotes ? `
      <div class="section">
        <h2 class="section-title">Your Additional Notes</h2>
        <div class="notes-box">${parsed.userNotes}</div>
      </div>
      ` : ''}
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${getEmailStyles()}</style>
</head>
<body>
  <div class="email-wrapper">
    ${getEmailHeader('Request Received!', 'Thank you for contacting Starr Surveying')}
    ${getReferenceBar(referenceNumber)}
    
    <div class="content">
      <p class="greeting">Hello ${data.name.split(' ')[0]},</p>
      
      <p style="font-size: 15px; color: ${COLORS.darkGray}; line-height: 1.7;">
        Thank you for reaching out to Starr Surveying! We have received your ${isCalculator ? 'estimate request' : 'inquiry'} 
        and will review it promptly. You can expect to hear back from us within <strong>24 business hours</strong>.
      </p>
      
      ${estimateSection}
      
      <!-- Your Contact Information -->
      <div class="section">
        <h2 class="section-title">Your Contact Information</h2>
        <div class="field">
          <div class="field-label">Reference Number</div>
          <div class="field-value" style="font-family: 'Courier New', monospace; font-weight: bold; color: ${COLORS.blue};">${referenceNumber}</div>
        </div>
        <div class="field">
          <div class="field-label">Name</div>
          <div class="field-value">${data.name}</div>
        </div>
        <div class="field">
          <div class="field-label">Email</div>
          <div class="field-value">${data.email}</div>
        </div>
        <div class="field">
          <div class="field-label">Phone</div>
          <div class="field-value">${data.phone}</div>
        </div>
      </div>
      
      ${projectDetailsSection}
      
      ${!isCalculator && data.propertyAddress ? `
      <div class="section">
        <h2 class="section-title">Property Information</h2>
        <div class="field">
          <div class="field-label">Property Address</div>
          <div class="field-value">${data.propertyAddress}</div>
        </div>
        ${data.serviceType ? `
        <div class="field">
          <div class="field-label">Service Requested</div>
          <div class="field-value">${data.serviceType}</div>
        </div>
        ` : ''}
      </div>
      ` : ''}
      
      ${!isCalculator && data.projectDetails ? `
      <div class="section">
        <h2 class="section-title">Your Message</h2>
        <div class="notes-box">${data.projectDetails}</div>
      </div>
      ` : ''}
      
      <!-- What's Next -->
      <div class="section section--red">
        <h2 class="section-title section-title--red">What Happens Next?</h2>
        <ul style="margin: 0; padding-left: 20px; color: ${COLORS.darkGray}; line-height: 1.8;">
          <li>Our team will review your request</li>
          <li>We may reach out if we need additional information</li>
          <li>You'll receive a detailed quote or response within 24 business hours</li>
          <li>Feel free to call us anytime if you have urgent questions</li>
        </ul>
      </div>
      
      <div class="divider"></div>
      
      <div class="cta-section">
        <p style="margin-bottom: 15px; color: ${COLORS.gray};">Questions? Give us a call!</p>
        <a href="tel:9366620077" class="cta-button" style="color: #FFFFFF;">Call (936) 662-0077</a>
      </div>
      
      <p class="timestamp">Submitted on ${timestamp}</p>
    </div>
    
    ${getEmailFooter()}
  </div>
</body>
</html>
  `.trim();
}

// =============================================================================
// PLAIN TEXT EMAIL BUILDERS
// =============================================================================

function buildPlainTextEmail(data: NormalizedData, referenceNumber: string, isCalculator: boolean): string {
  const timestamp = new Date().toLocaleString('en-US', { 
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (isCalculator) {
    const parsed = parseCalculatorMessage(data.message);
    
    let text = `STARR SURVEYING - NEW ESTIMATE REQUEST\n`;
    text += `========================================\n`;
    text += `Reference: ${referenceNumber}\n\n`;
    text += `ESTIMATE: ${parsed.estimateRange}\n`;
    text += `Survey Type: ${parsed.surveyType}\n`;
    if (parsed.isRush) text += `** RUSH JOB REQUESTED **\n`;
    text += `\nCONTACT INFORMATION\n`;
    text += `-------------------\n`;
    text += `Name: ${data.name}\n`;
    text += `Email: ${data.email}\n`;
    text += `Phone: ${data.phone}\n`;
    text += `\nPROJECT DETAILS\n`;
    text += `---------------\n`;
    for (const detail of parsed.projectDetails) {
      text += `${detail.label}: ${detail.value}\n`;
    }
    if (parsed.userNotes) {
      text += `\nADDITIONAL NOTES\n`;
      text += `----------------\n`;
      text += `${parsed.userNotes}\n`;
    }
    text += `\n----------------------------------------\n`;
    text += `Submitted: ${timestamp}\n`;
    text += `Source: Website Calculator`;
    
    return text;
  }

  return `
STARR SURVEYING - NEW CONTACT FORM SUBMISSION
=============================================
Reference: ${referenceNumber}

CONTACT INFORMATION
-------------------
Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone}
Company: ${data.company || 'Not provided'}
Preferred Contact: ${data.preferredContact || 'Email'}

PROPERTY & SERVICE
------------------
Property Address: ${data.propertyAddress || 'Not provided'}
Service Type: ${data.serviceType || 'Not specified'}
How They Found Us: ${data.howHeard || 'Not specified'}

PROJECT DETAILS
---------------
${data.projectDetails || 'No details provided'}

----------------------------------------
Submitted: ${timestamp}
Source: Website Contact Form
  `.trim();
}

function buildCustomerPlainText(data: NormalizedData, referenceNumber: string, isCalculator: boolean): string {
  let text = `Thank you for contacting Starr Surveying!\n\n`;
  text += `Reference Number: ${referenceNumber}\n\n`;
  text += `We have received your request and will respond within 24 business hours.\n\n`;
  
  if (isCalculator && data.message) {
    const parsed = parseCalculatorMessage(data.message);
    text += `YOUR ESTIMATE REQUEST\n`;
    text += `---------------------\n`;
    text += `Estimated Range: ${parsed.estimateRange}\n`;
    text += `Survey Type: ${parsed.surveyType}\n`;
    if (parsed.isRush) text += `Rush Job: Yes\n`;
    text += `\n`;
    for (const detail of parsed.projectDetails) {
      text += `${detail.label}: ${detail.value}\n`;
    }
    if (parsed.userNotes) {
      text += `\nYour Notes: ${parsed.userNotes}\n`;
    }
    text += `\n`;
  }
  
  text += `YOUR CONTACT INFORMATION\n`;
  text += `------------------------\n`;
  text += `Name: ${data.name}\n`;
  text += `Email: ${data.email}\n`;
  text += `Phone: ${data.phone}\n`;
  
  if (!isCalculator) {
    if (data.propertyAddress) text += `Property: ${data.propertyAddress}\n`;
    if (data.serviceType) text += `Service: ${data.serviceType}\n`;
    if (data.projectDetails) text += `\nYour Message:\n${data.projectDetails}\n`;
  }
  
  text += `\nIf you have any urgent questions, please call us at (936) 662-0077.\n\n`;
  text += `---\n`;
  text += `Starr Surveying\n`;
  text += `${COMPANY.address}\n`;
  text += `${COMPANY.proverb}`;
  
  return text;
}

// =============================================================================
// EMAIL SENDING FUNCTION (Resend)
// =============================================================================

async function sendEmail(
  apiKey: string,
  to: string[],
  replyTo: string,
  subject: string,
  text: string,
  html: string
): Promise<boolean> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Starr Surveying <noreply@starr-surveying.com>',
        to,
        reply_to: replyTo,
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Resend API error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}

// =============================================================================
// MAIN API HANDLER
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: IncomingFormData = await request.json();
    const referenceNumber = generateReferenceNumber();

    // Normalize field names
    const data: NormalizedData = {
      name: body.name || body.full_name || '',
      email: body.email || '',
      phone: body.phone || '',
      company: body.company || body.company_name || '',
      propertyAddress: body.propertyAddress || body.property_address || '',
      serviceType: body.serviceType || body.service_type || '',
      projectDetails: body.projectDetails || body.project_description || '',
      preferredContact: body.preferredContact || body.preferred_contact_method || 'email',
      howHeard: body.howHeard || body.how_heard || '',
      source: body.source || 'contact-form',
      subject: body.subject || '',
      message: body.message || '',
    };

    // Validate required fields
    if (!data.name || !data.email || !data.phone) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required fields',
          error: 'Please fill in all required fields (name, email, phone).',
        },
        { status: 400 }
      );
    }

    const isCalculator = data.source === 'pricing-calculator';
    
    // Build email content
    const businessSubject = isCalculator
      ? `${data.subject || 'Survey Estimate Request'} [${referenceNumber}]`
      : `New Inquiry - ${data.name} [${referenceNumber}]`;
    
    const customerSubject = `Your Starr Surveying Request [${referenceNumber}]`;
    
    const businessHtml = isCalculator
      ? buildCalculatorEmailHtml(data, referenceNumber)
      : buildContactFormEmailHtml(data, referenceNumber);
    
    const businessText = buildPlainTextEmail(data, referenceNumber, isCalculator);
    const customerHtml = buildCustomerConfirmationHtml(data, referenceNumber, isCalculator);
    const customerText = buildCustomerPlainText(data, referenceNumber, isCalculator);

    // Get API key
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    // Check if Resend is configured
    if (!RESEND_API_KEY || RESEND_API_KEY === 'your_resend_api_key') {
      // Development mode - log everything
      console.log('='.repeat(70));
      console.log('DEV MODE - Emails would be sent:');
      console.log('='.repeat(70));
      console.log('Reference:', referenceNumber);
      console.log('\n--- BUSINESS EMAIL ---');
      console.log('To:', EMAIL_RECIPIENTS.join(', '));
      console.log('Subject:', businessSubject);
      console.log('\n--- CUSTOMER CONFIRMATION ---');
      console.log('To:', data.email);
      console.log('Subject:', customerSubject);
      console.log('='.repeat(70));

      return NextResponse.json(
        {
          success: true,
          message: 'Form received (dev mode - check server logs)',
          reference: referenceNumber,
        },
        { status: 200 }
      );
    }

    // Send emails
    const emailResults = await Promise.allSettled([
      // 1. Business notification email
      sendEmail(
        RESEND_API_KEY,
        EMAIL_RECIPIENTS,
        data.email,
        businessSubject,
        businessText,
        businessHtml
      ),
      
      // 2. Customer confirmation email
      sendEmail(
        RESEND_API_KEY,
        [data.email],
        'info@starr-surveying.com',
        customerSubject,
        customerText,
        customerHtml
      ),
    ]);

    // Check results
    const [businessEmail, customerEmail] = emailResults;
    
    console.log(`[${referenceNumber}] Results:`, {
      business: businessEmail.status === 'fulfilled' ? businessEmail.value : 'failed',
      customer: customerEmail.status === 'fulfilled' ? customerEmail.value : 'failed',
    });

    // Return success if at least business email sent
    if (businessEmail.status === 'fulfilled' && businessEmail.value) {
      return NextResponse.json(
        {
          success: true,
          message: 'Thank you for your submission! We will contact you within 24 business hours.',
          reference: referenceNumber,
        },
        { status: 200 }
      );
    }

    // All failed
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to send your request. Please try again or call us directly at (936) 662-0077.',
        error: 'Email service error',
      },
      { status: 500 }
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
      features: [
        'Multiple email recipients',
        'Customer confirmation emails',
        'Styled HTML emails with branding',
        'Unique reference numbers',
      ],
      timestamp: new Date().toISOString(),
    }, 
    { status: 200 }
  );
}