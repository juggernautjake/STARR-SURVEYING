// app/api/auth/register/route.ts
// Registration endpoint for external (non-company) users
import { supabaseAdmin } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = body;

    // Validate required fields
    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    // Trim and normalize
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Company emails should use Google sign-in
    if (cleanEmail.endsWith('@starr-surveying.com')) {
      return NextResponse.json(
        { error: 'Starr Surveying employees should sign in with Google instead' },
        { status: 400 }
      );
    }

    // Password strength
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Name validation
    if (cleanName.length < 2 || cleanName.length > 100) {
      return NextResponse.json({ error: 'Name must be between 2 and 100 characters' }, { status: 400 });
    }

    // Check if email already registered
    const { data: existing } = await supabaseAdmin
      .from('registered_users')
      .select('id')
      .eq('email', cleanEmail)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('registered_users')
      .insert({
        email: cleanEmail,
        password_hash: passwordHash,
        name: cleanName,
        role: 'employee',
        is_approved: true,
      })
      .select('id, email, name')
      .single();

    if (insertError) {
      console.error('Registration insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully. You can now sign in.',
      user: { id: newUser.id, email: newUser.email, name: newUser.name },
    });
  } catch (err) {
    console.error('Registration error:', err);
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
