import React, { useState } from 'react';
import { Icons } from './ui/Icons';
import { UserProfile } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../src/contexts/AuthContext';
import { userService } from '../src/services/firebaseService';

interface AuthProps {
  onComplete: (user: UserProfile) => void;
}

export const Auth: React.FC<AuthProps> = ({ onComplete }) => {
  const [isSignUp, setIsSignUp] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const { t } = useLanguage();
  const { signUp, signIn, resetPassword } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let firebaseUser;
      if (isSignUp) {
        // Sign up with Firebase
        if (!formData.name.trim()) {
          throw new Error('Please enter your name');
        }
        firebaseUser = await signUp(formData.email, formData.password, formData.name);
      } else {
        // Sign in with Firebase
        firebaseUser = await signIn(formData.email, formData.password);
      }

      // Fetch actual user profile from Firestore to get isPro status
      // For sign-up, this will be a new profile with isPro: false
      // For sign-in, this will have the user's actual isPro status
      const firestoreProfile = await userService.getProfile(firebaseUser.uid);

      const user: UserProfile = {
        name: firestoreProfile?.displayName || formData.name || formData.email.split('@')[0],
        email: formData.email,
        isPro: firestoreProfile?.isPro || false,
        joinDate: firestoreProfile?.joinDate?.toMillis?.() || Date.now()
      };
      onComplete(user);
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Authentication failed. Please try again.');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await resetPassword(formData.email);
      alert('Password reset email sent! Please check your inbox.');
      setShowForgotPassword(false);
      setFormData({ ...formData, password: '' });
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'Google' | 'Apple') => {
    setError('Social login will be available in a future update.');
    // TODO: Implement Google/Apple OAuth in Phase 4
  };

  // Forgot Password View
  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-100/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-purple-100/50 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md z-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 mx-auto mb-4 transform -rotate-3">
              <Icons.Lock className="text-white" size={32} />
            </div>
            <h2 className="text-3xl font-bold font-serif text-gray-800">Reset Password</h2>
            <p className="text-gray-500 mt-2">Enter your email to receive a reset link</p>
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-8 border border-white/50 backdrop-blur-sm">
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide ml-1">Email</label>
                <div className="relative">
                  <Icons.Mail className="absolute left-4 top-3.5 text-gray-400" size={20} />
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none transition-all"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Send Reset Link
                    <Icons.ArrowRight size={20} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setShowForgotPassword(false);
                  setError(null);
                }}
                className="text-indigo-600 font-semibold hover:text-indigo-800 transition-colors"
              >
                ← Back to Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-100/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-purple-100/50 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md z-10">
            <div className="text-center mb-8">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 mx-auto mb-4 transform -rotate-3">
                    <Icons.Book className="text-white" size={32} />
                </div>
                <h2 className="text-3xl font-bold font-serif text-gray-800">
                    {isSignUp ? t('create_account') : t('welcome_back')}
                </h2>
                <p className="text-gray-500 mt-2">
                    {isSignUp ? t('join_msg') : t('signin_msg')}
                </p>
            </div>

            <div className="bg-white rounded-3xl shadow-xl p-8 border border-white/50 backdrop-blur-sm">

                {/* Error Message */}
                {error && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                    {error}
                  </div>
                )}
                
                {/* Social Login Buttons */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <button 
                        type="button"
                        onClick={() => handleSocialLogin('Google')}
                        disabled={isLoading}
                        className="flex items-center justify-center gap-2 py-3 px-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        <Icons.Google size={20} />
                        <span className="text-sm font-semibold text-gray-700">Google</span>
                    </button>
                    <button 
                        type="button"
                        onClick={() => handleSocialLogin('Apple')}
                        disabled={isLoading}
                        className="flex items-center justify-center gap-2 py-3 px-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        <Icons.Apple size={20} className="text-black" />
                        <span className="text-sm font-semibold text-gray-700">Apple</span>
                    </button>
                </div>

                <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-500">{t('or_continue')}</span>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    
                    {isSignUp && (
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide ml-1">{t('full_name')}</label>
                            <div className="relative">
                                <Icons.User className="absolute left-4 top-3.5 text-gray-400" size={20} />
                                <input 
                                    type="text"
                                    required={isSignUp}
                                    placeholder="John Doe"
                                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none transition-all"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide ml-1">{t('email')}</label>
                        <div className="relative">
                            <Icons.Mail className="absolute left-4 top-3.5 text-gray-400" size={20} />
                            <input 
                                type="email"
                                required
                                placeholder="name@example.com"
                                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none transition-all"
                                value={formData.email}
                                onChange={(e) => setFormData({...formData, email: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('password')}</label>
                          {!isSignUp && (
                            <button
                              type="button"
                              onClick={() => setShowForgotPassword(true)}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
                            >
                              Forgot?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                            <Icons.Lock className="absolute left-4 top-3.5 text-gray-400" size={20} />
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                placeholder="••••••••"
                                minLength={6}
                                className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none transition-all"
                                value={formData.password}
                                onChange={(e) => setFormData({...formData, password: e.target.value})}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600"
                            >
                                {showPassword ? <Icons.EyeOff size={20} /> : <Icons.Eye size={20} />}
                            </button>
                        </div>
                    </div>

                    <button 
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4"
                    >
                        {isLoading ? (
                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                {isSignUp ? t('create_account') : t('sign_in')}
                                <Icons.ArrowRight size={20} />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <p className="text-gray-500 text-sm">
                        {isSignUp ? t('already_have') : t('dont_have')}
                        <button 
                            onClick={() => setIsSignUp(!isSignUp)}
                            className="ml-1 text-indigo-600 font-semibold hover:text-indigo-800 transition-colors"
                        >
                            {isSignUp ? t('sign_in') : t('sign_up')}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    </div>
  );
};