import React from 'react';
import {
  BookOpen,
  MessageSquare,
  X,
  Send,
  Upload,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Menu,
  Type,
  Trash2,
  Library,
  Plus,
  Minus,
  ArrowRight,
  CheckCircle,
  Home,
  Search,
  MoreVertical,
  User,
  Lock,
  Mail,
  Eye,
  EyeOff,
  LogOut,
  Bookmark,
  List,
  Palette,
  CreditCard,
  Crown,
  Star,
  Globe,
  AlertTriangle,
  Trash
} from 'lucide-react';

// Custom SVG Components for Brands
const GoogleIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const AppleIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.05 20.28c-.98.95-2.05 1.64-3.02 1.64-1.05 0-2.04-1.64-3.6-1.64-1.57 0-2.55 1.6-3.59 1.64-1.04.05-2.04-.6-3.02-1.64-4.56-4.9-3.03-12.28 2.25-12.28 1.48 0 2.45.62 3.08.62.63 0 1.95-.62 3.6-.62 1.42 0 2.58.6 3.41 1.6-2.88 1.45-2.35 6.13.56 7.42-.64 1.4-1.28 2.65-2.67 3.26zm-4.7-18.2c.7-.8 2.3-1.65 3.1-1.65.18 1.95-1.85 3.55-3.1 3.55-.58 0-2.45-.75-2.5-3.3.05 0 1.8-.1 2.5 1.4z"/>
  </svg>
);

export const Icons = {
  Book: BookOpen,
  Chat: MessageSquare,
  Close: X,
  Send: Send,
  Upload: Upload,
  Prev: ChevronLeft,
  Next: ChevronRight,
  Sparkles: Sparkles,
  Menu: Menu,
  Font: Type,
  Clear: Trash2,
  Library: Library,
  Plus: Plus,
  Minus: Minus,
  ArrowRight: ArrowRight,
  Check: CheckCircle,
  Home: Home,
  Search: Search,
  More: MoreVertical,
  User: User,
  Lock: Lock,
  Mail: Mail,
  Eye: Eye,
  EyeOff: EyeOff,
  LogOut: LogOut,
  Google: GoogleIcon,
  Apple: AppleIcon,
  Bookmark: Bookmark,
  List: List,
  Palette: Palette,
  CreditCard: CreditCard,
  Crown: Crown,
  Star: Star,
  Globe: Globe,
  AlertTriangle: AlertTriangle,
  Trash: Trash
};