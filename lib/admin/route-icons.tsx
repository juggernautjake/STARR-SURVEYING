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
  Activity, AlertTriangle, ArrowLeftRight, ArrowUpCircle, BadgeDollarSign, Banknote, BarChart3,
  Bell, BookMarked, BookOpen, BookText, Boxes,
  Briefcase, Brush, Bug, Building, Building2, Calendar, CalendarClock, CalendarDays, Camera, Car,
  CheckCircle2, CheckSquare, Circle, ClipboardCheck, ClipboardList, Clock, CloudSun, Code, Compass, Contact,
  CreditCard, DollarSign, DraftingCompass, EyeOff, FileBarChart, FileCheck, FilePlus, FileSpreadsheet,
  FileText, Files, Folder,
  FolderOpen, GanttChart, Globe, GraduationCap, HandCoins, HardHat, HelpCircle, History, Home, Image,
  Inbox, KeyRound, Landmark,
  Layers, LayoutDashboard, Library, LifeBuoy, Lightbulb, ListChecks, Lock, MailCheck, MailPlus, Map, MapPin,
  Megaphone, MessageSquare, MessageSquarePlus, MessagesSquare, Microscope, Notebook, NotebookPen,
  Package, PackageOpen, PaintBucket, Palmtree, Pencil, PenTool, PieChart, Play, Plus, Receipt, ReceiptText,
  Route, Satellite, Scale, ScrollText, Search, Settings, Settings2,
  ShieldCheck, ShieldPlus, Smartphone, Sparkles, SquarePen, StickyNote, Tags, Timer, Trash2, TrendingUp,
  Trophy, Truck, Upload, UploadCloud, User, UserCog,
  UserPlus, Users, UsersRound, Wallet, Workflow, Wrench, FlaskConical,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  Activity, AlertTriangle, ArrowLeftRight, ArrowUpCircle, BadgeDollarSign, Banknote, BarChart3,
  Bell, BookMarked, BookOpen, BookText, Boxes,
  Briefcase, Brush, Bug, Building, Building2, Calendar, CalendarClock, CalendarDays, Camera, Car,
  CheckCircle2, CheckSquare, Circle, ClipboardCheck, ClipboardList, Clock, CloudSun, Code, Compass, Contact,
  CreditCard, DollarSign, DraftingCompass, EyeOff, FileBarChart, FileCheck, FilePlus, FileSpreadsheet,
  FileText, Files, Folder,
  FolderOpen, GanttChart, Globe, GraduationCap, HandCoins, HardHat, HelpCircle, History, Home, Image,
  Inbox, KeyRound, Landmark,
  Layers, LayoutDashboard, Library, LifeBuoy, Lightbulb, ListChecks, Lock, MailCheck, MailPlus, Map, MapPin,
  Megaphone, MessageSquare, MessageSquarePlus, MessagesSquare, Microscope, Notebook, NotebookPen,
  Package, PackageOpen, PaintBucket, Palmtree, Pencil, PenTool, PieChart, Play, Plus, Receipt, ReceiptText,
  Route, Satellite, Scale, ScrollText, Search, Settings, Settings2,
  ShieldCheck, ShieldPlus, Smartphone, Sparkles, SquarePen, StickyNote, Tags, Timer, Trash2, TrendingUp,
  Trophy, Truck, Upload, UploadCloud, User, UserCog,
  UserPlus, Users, UsersRound, Wallet, Workflow, Wrench, FlaskConical,
};

export function iconForName(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || Circle;
}

/** True when the name resolves to a real icon rather than the neutral fallback.
 *
 *  This exists because the fallback is silent by design — a typo must never crash the nav — and
 *  silence is how 41 of the registry's 100 icon names came to render as an identical grey Circle
 *  while every one of them was a valid lucide export that simply had not been added to the map
 *  above. Nothing failed; the icons just quietly stopped distinguishing anything. A ratchet test
 *  calls this for every registered route so the map cannot fall behind the registry again. */
export function isKnownIconName(name: string | undefined): boolean {
  return !!name && Object.prototype.hasOwnProperty.call(ICONS, name);
}

/** Every name the resolver knows. Exported for the ratchet, not for rendering. */
export function knownIconNames(): string[] {
  return Object.keys(ICONS);
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
