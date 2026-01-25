// Contact Form Types
export interface ContactFormData {
  full_name: string;
  email: string;
  phone: string;
  company_name?: string;
  service_type: string;
  property_address?: string;
  project_description?: string;
  preferred_contact_method: 'email' | 'phone' | 'both';
  how_heard?: string;
}

export interface ContactSubmission extends ContactFormData {
  id: number;
  created_at: string;
  status: 'new' | 'contacted' | 'completed';
  notes?: string;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// Component Props Types
export interface HeaderProps {
  isOpen?: boolean;
}

export interface FooterProps {
  currentYear?: number;
}

export interface ServiceCardProps {
  icon: string;
  title: string;
  description: string;
}

export interface TeamMemberProps {
  name: string;
  title: string;
  experience?: string;
  description?: string;
  image?: string;
}

export interface NavLink {
  href: string;
  label: string;
}

export interface Service {
  icon: string;
  title: string;
  description: string;
}

export interface ContactFormState {
  loading: boolean;
  submitted: boolean;
  error: string;
}