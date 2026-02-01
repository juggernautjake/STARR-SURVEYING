'use client';

import type { ContactFormData, ContactFormState } from '../../types';
import { useState, FormEvent, ChangeEvent } from 'react';
import { trackConversion } from '../utils/gtag';

const ContactForm = (): React.ReactElement => {
  const [formData, setFormData] = useState<ContactFormData>({
    full_name: '',
    email: '',
    phone: '',
    company_name: '',
    service_type: '',
    property_address: '',
    project_description: '',
    preferred_contact_method: 'email',
    how_heard: '',
  });

  const [state, setState] = useState<ContactFormState>({
    loading: false,
    submitted: false,
    error: '',
  });

  const serviceTypes: string[] = [
    'GPS Surveying',
    'GIS Services',
    'Total Station Surveying',
    'Plats and Plot Maps',
    'Deeds and Legal Descriptions',
    'Other',
  ];

  const hearAboutUs: string[] = [
    'Google Search',
    'Referral',
    'Word of Mouth',
    'Social Media',
    'Yellow Pages',
    'Other',
  ];

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ): void => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setState(prev => ({ ...prev, loading: true, error: '' }));

    if (!formData.full_name || !formData.email || !formData.phone || !formData.service_type) {
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: 'Please fill in all required fields.' 
      }));
      return;
    }

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        // Track Google Ads conversion on successful form submission
        trackConversion();

        setState(prev => ({ ...prev, submitted: true }));
        setFormData({
          full_name: '',
          email: '',
          phone: '',
          company_name: '',
          service_type: '',
          property_address: '',
          project_description: '',
          preferred_contact_method: 'email',
          how_heard: '',
        });
        setTimeout(() => setState(prev => ({ ...prev, submitted: false })), 5000);
      } else {
        setState(prev => ({ 
          ...prev, 
          error: 'Failed to submit form. Please try again.' 
        }));
      }
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: 'An error occurred. Please try again.' 
      }));
      console.error('Form submission error:', err);
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  if (state.submitted) {
    return (
      <div className="alert alert-success text-center py-8">
        <h3 className="text-xl font-bold mb-2">Thank You!</h3>
        <p>Your submission has been received. We'll contact you within 24 business hours.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg">
      {state.error && (
        <div className="alert alert-error mb-6">{state.error}</div>
      )}

      <div className="grid grid-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="full_name" className="block font-bold text-sm mb-2">
            Full Name *
          </label>
          <input
            type="text"
            id="full_name"
            name="full_name"
            value={formData.full_name}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border-2 border-gray-300 rounded focus:border-starr-red focus:outline-none transition"
            placeholder="Your Name"
          />
        </div>

        <div>
          <label htmlFor="email" className="block font-bold text-sm mb-2">
            Email *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border-2 border-gray-300 rounded focus:border-starr-red focus:outline-none transition"
            placeholder="your.email@example.com"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block font-bold text-sm mb-2">
            Phone *
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border-2 border-gray-300 rounded focus:border-starr-red focus:outline-none transition"
            placeholder="(123) 456-7890"
          />
        </div>

        <div>
          <label htmlFor="company_name" className="block font-bold text-sm mb-2">
            Company or Property Name
          </label>
          <input
            type="text"
            id="company_name"
            name="company_name"
            value={formData.company_name}
            onChange={handleChange}
            className="w-full px-4 py-2 border-2 border-gray-300 rounded focus:border-starr-red focus:outline-none transition"
            placeholder="Enter company or property name"
          />
        </div>

        <div>
          <label htmlFor="service_type" className="block font-bold text-sm mb-2">
            Service Type *
          </label>
          <select
            id="service_type"
            name="service_type"
            value={formData.service_type}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border-2 border-gray-300 rounded focus:border-starr-red focus:outline-none transition"
          >
            <option value="">-- Select Service --</option>
            {serviceTypes.map((service: string) => (
              <option key={service} value={service}>{service}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="preferred_contact_method" className="block font-bold text-sm mb-2">
            Preferred Contact Method
          </label>
          <select
            id="preferred_contact_method"
            name="preferred_contact_method"
            value={formData.preferred_contact_method}
            onChange={handleChange}
            className="w-full px-4 py-2 border-2 border-gray-300 rounded focus:border-starr-red focus:outline-none transition"
          >
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="both">Both</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="property_address" className="block font-bold text-sm mb-2">
            Property Address or Location
          </label>
          <input
            type="text"
            id="property_address"
            name="property_address"
            value={formData.property_address}
            onChange={handleChange}
            className="w-full px-4 py-2 border-2 border-gray-300 rounded focus:border-starr-red focus:outline-none transition"
            placeholder="Street address, city, or area"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="how_heard" className="block font-bold text-sm mb-2">
            How Did You Hear About Us?
          </label>
          <select
            id="how_heard"
            name="how_heard"
            value={formData.how_heard}
            onChange={handleChange}
            className="w-full px-4 py-2 border-2 border-gray-300 rounded focus:border-starr-red focus:outline-none transition"
          >
            <option value="">-- Select Option --</option>
            {hearAboutUs.map((option: string) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="project_description" className="block font-bold text-sm mb-2">
            Project Description or Details
          </label>
          <textarea
            id="project_description"
            name="project_description"
            value={formData.project_description}
            onChange={handleChange}
            className="w-full px-4 py-2 border-2 border-gray-300 rounded focus:border-starr-red focus:outline-none transition"
            placeholder="Tell us about your project..."
            rows={5}
          ></textarea>
        </div>
      </div>

      <div className="mt-8 flex gap-4">
        <button
          type="submit"
          disabled={state.loading}
          className="btn btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state.loading ? 'Submitting...' : 'Submit Request'}
        </button>
        <button
          type="reset"
          className="btn btn-outline flex-1"
        >
          Clear
        </button>
      </div>

      <p className="text-xs text-gray-600 mt-4 text-center">
        * Required fields
      </p>
    </form>
  );
};

export default ContactForm;