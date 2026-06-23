// lib/admin/route-icons.tsx
//
// Registry-driven icon resolver: maps the plain lucide-icon-name strings
// stored in route-registry.ts (and used by AdminSidebar nav items) to the
// actual lucide-react components, so functional/nav icons render as one
// consistent line-icon set instead of per-OS emoji (audit pattern 12).
//
// Usage:  <RouteIcon name="GraduationCap" size={18} />
// Unknown names fall back to a neutral Circle so a typo never crashes nav.

import {
  Activity, AlertTriangle, ArrowLeftRight, Banknote, BarChart3, Bell, BookMarked, BookOpen,
  Briefcase, Brush, Bug, Building, Building2, Calendar, CalendarDays, Car,
  CheckCircle2, Circle, ClipboardCheck, ClipboardList, Clock, Compass, Contact,
  CreditCard, DraftingCompass, FileBarChart, FilePlus, FileText, Files, Folder,
  FolderOpen, GraduationCap, HelpCircle, Home, Inbox, KeyRound, Landmark,
  Layers, LayoutDashboard, LifeBuoy, Lightbulb, ListChecks, Lock, Map, MapPin,
  Megaphone, MessageSquare, MessagesSquare, Microscope, Notebook, NotebookPen,
  Package, PaintBucket, Palmtree, Receipt, Route, Satellite, Search, Settings,
  ShieldCheck, Smartphone, SquarePen, StickyNote, Trash2, TrendingUp, Trophy, Truck, User,
  UserPlus, Users, Wallet, Wrench, FlaskConical,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  Activity, AlertTriangle, ArrowLeftRight, Banknote, BarChart3, Bell, BookMarked, BookOpen,
  Briefcase, Brush, Bug, Building, Building2, Calendar, CalendarDays, Car,
  CheckCircle2, Circle, ClipboardCheck, ClipboardList, Clock, Compass, Contact,
  CreditCard, DraftingCompass, FileBarChart, FilePlus, FileText, Files, Folder,
  FolderOpen, GraduationCap, HelpCircle, Home, Inbox, KeyRound, Landmark,
  Layers, LayoutDashboard, LifeBuoy, Lightbulb, ListChecks, Lock, Map, MapPin,
  Megaphone, MessageSquare, MessagesSquare, Microscope, Notebook, NotebookPen,
  Package, PaintBucket, Palmtree, Receipt, Route, Satellite, Search, Settings,
  ShieldCheck, Smartphone, SquarePen, StickyNote, Trash2, TrendingUp, Trophy, Truck, User,
  UserPlus, Users, Wallet, Wrench, FlaskConical,
};

export function iconForName(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || Circle;
}

export function RouteIcon({
  name,
  size = 18,
  strokeWidth = 1.75,
  className,
}: {
  name: string | undefined;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Icon = iconForName(name);
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}
