import { NextRequest, NextResponse } from 'next/server';
import type { ContactFormData, ApiResponse, ContactSubmission } from '../../../types';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<ContactSubmission>>> {
  try {
    const body: ContactFormData = await request.json();

    // Validate required fields
    if (!body.full_name || !body.email || !body.phone || !body.service_type) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required fields',
          error: 'Please fill in all required fields.',
        },
        { status: 400 }
      );
    }

    // Mock database insert (replace with Supabase when ready)
    const submission: ContactSubmission = {
      id: Math.floor(Math.random() * 10000),
      created_at: new Date().toISOString(),
      status: 'new',
      ...body,
    };

    // Log to console for now
    console.log('Contact Form Submission:', submission);

    // In production, you would:
    // 1. Insert into Supabase database
    // 2. Send email via Mailgun to admin
    // 3. Send confirmation email to customer

    return NextResponse.json(
      {
        success: true,
        message: 'Thank you for your submission! We will contact you soon.',
        data: submission,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'An error occurred processing your request',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse<{ status: string }>> {
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}