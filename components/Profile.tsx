import React, { useState } from 'react';
import { Icons } from './ui/Icons';
import { UserProfile } from '../types';
import { useLanguage, LANGUAGES } from '../contexts/LanguageContext';

interface ProfileProps {
    user: UserProfile;
    onBack: () => void;
    onUpgrade: () => void;
    onSignOut: () => void;
}

export const Profile: React.FC<ProfileProps> = ({ user, onBack, onUpgrade, onSignOut }) => {
    const [isUpgrading, setIsUpgrading] = useState(false);
    const { t, language, setLanguage } = useLanguage();

    const handleUpgradeClick = async () => {
        setIsUpgrading(true);
        // Simulate payment processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        onUpgrade();
        setIsUpgrading(false);
    };

    return (
        <div className="min-h-screen bg-stone-50 flex flex-col">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
                <button 
                    onClick={onBack}
                    className="p-2 -ml-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <Icons.Prev size={24} />
                </button>
                <h1 className="text-xl font-bold text-gray-900">{t('my_account')}</h1>
            </header>

            <main className="flex-1 max-w-3xl w-full mx-auto p-6 space-y-6">
                
                {/* User Info Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-6">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-indigo-200">
                        {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-900">{user.name}</h2>
                        <p className="text-gray-500">{user.email}</p>
                        <p className="text-xs text-gray-400 mt-1">{t('member_since')} {new Date(user.joinDate).toLocaleDateString()}</p>
                    </div>
                    {user.isPro && (
                        <div className="bg-gradient-to-r from-amber-200 to-yellow-400 px-4 py-1.5 rounded-full text-yellow-900 font-bold text-sm flex items-center gap-1.5 shadow-sm">
                            <Icons.Crown size={16} />
                            <span>{t('pro').toUpperCase()}</span>
                        </div>
                    )}
                </div>

                {/* Language Settings */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                     <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
                        <Icons.Globe size={20} className="text-indigo-600" /> {t('language')}
                     </h3>
                     <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {LANGUAGES.map(lang => (
                            <button
                                key={lang.code}
                                onClick={() => setLanguage(lang.code)}
                                className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                                    language === lang.code 
                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600' 
                                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                                }`}
                            >
                                <span className="text-xl">{lang.flag}</span>
                                <span className="font-medium text-sm">{lang.label}</span>
                            </button>
                        ))}
                     </div>
                </div>

                {/* Membership Plan */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 overflow-hidden relative">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Icons.CreditCard size={20} className="text-indigo-600" /> {t('subscription_plan')}
                        </h3>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Free Tier */}
                        <div className={`flex-1 rounded-xl border p-5 transition-all ${!user.isPro ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600' : 'border-gray-200 opacity-70 grayscale'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold text-lg text-gray-800">{t('free')}</h4>
                                {!user.isPro && <Icons.Check className="text-indigo-600" size={20} />}
                            </div>
                            <p className="text-sm text-gray-500 mb-4">{t('basic_features')}</p>
                            <ul className="space-y-2 mb-4">
                                <li className="flex items-center gap-2 text-sm text-gray-700">
                                    <Icons.Check size={14} className="text-green-500" /> {t('unlimited_uploads')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-gray-700">
                                    <Icons.Check size={14} className="text-green-500" /> {t('reading_customization')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-gray-400 line-through">
                                    <Icons.Lock size={14} /> {t('ai_coreading')}
                                </li>
                            </ul>
                            <div className="font-bold text-2xl text-gray-800">$0<span className="text-sm font-normal text-gray-500">/mo</span></div>
                        </div>

                        {/* Pro Tier */}
                        <div className={`flex-1 rounded-xl border p-5 transition-all relative overflow-hidden ${user.isPro ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600' : 'border-gray-200'}`}>
                            {!user.isPro && (
                                <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                                    {t('recommended')}
                                </div>
                            )}
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold text-lg text-indigo-900 flex items-center gap-2">
                                    {t('pro')} <Icons.Sparkles size={16} className="text-amber-500" />
                                </h4>
                                {user.isPro && <Icons.Check className="text-indigo-600" size={20} />}
                            </div>
                            <p className="text-sm text-gray-500 mb-4">{t('unlock_power')}</p>
                            <ul className="space-y-2 mb-6">
                                <li className="flex items-center gap-2 text-sm text-gray-700">
                                    <Icons.Check size={14} className="text-green-500" /> {t('free_plan')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-gray-700">
                                    <Icons.Check size={14} className="text-green-500" /> <b>{t('ai_coreading')}</b>
                                </li>
                                <li className="flex items-center gap-2 text-sm text-gray-700">
                                    <Icons.Check size={14} className="text-green-500" /> {t('instant_translations')}
                                </li>
                            </ul>
                            
                            <div className="flex items-end justify-between">
                                <div className="font-bold text-2xl text-gray-800">$5<span className="text-sm font-normal text-gray-500">/mo</span></div>
                                {!user.isPro ? (
                                    <button 
                                        onClick={handleUpgradeClick}
                                        disabled={isUpgrading}
                                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isUpgrading ? (
                                            <>{t('processing')}</>
                                        ) : (
                                            <>{t('upgrade_btn').split(' - ')[0]} <Icons.ArrowRight size={16} /></>
                                        )}
                                    </button>
                                ) : (
                                    <span className="text-sm font-medium text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                                        {t('active')}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <button 
                        onClick={onSignOut}
                        className="w-full text-left p-4 hover:bg-red-50 text-red-600 flex items-center gap-3 transition-colors"
                    >
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                            <Icons.LogOut size={16} />
                        </div>
                        <span className="font-medium">{t('sign_out')}</span>
                    </button>
                </div>
            </main>
        </div>
    );
};