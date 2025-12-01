import React, { useState } from 'react';
import { Icons } from './ui/Icons';
import { useLanguage, LANGUAGES } from '../contexts/LanguageContext';

interface OnboardingProps {
  onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const { t, language, setLanguage } = useLanguage();

  const steps = [
    {
      title: t('welcome_title'),
      description: t('welcome_desc'),
      icon: <Icons.Book size={64} className="text-indigo-600" />,
      color: "bg-indigo-50"
    },
    {
      title: t('ai_title'),
      description: t('ai_desc'),
      icon: <Icons.Sparkles size={64} className="text-purple-600" />,
      color: "bg-purple-50"
    },
    {
      title: t('library_title'),
      description: t('library_desc'),
      icon: <Icons.Library size={64} className="text-teal-600" />,
      color: "bg-teal-50"
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const activeLang = LANGUAGES.find(l => l.code === language);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-1/2 bg-stone-50 rounded-b-[3rem] -z-10" />

      {/* Language Selector */}
      <div className="absolute top-6 right-6 z-20">
        <button 
          onClick={() => setShowLangMenu(!showLangMenu)}
          className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span>{activeLang?.flag}</span>
          <span>{activeLang?.code.toUpperCase()}</span>
          <Icons.Globe size={14} className="text-gray-400" />
        </button>
        
        {showLangMenu && (
          <div className="absolute top-full right-0 mt-2 w-40 bg-white rounded-xl shadow-xl border border-gray-100 py-2 overflow-hidden">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => {
                  setLanguage(lang.code);
                  setShowLangMenu(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 hover:bg-indigo-50 transition-colors ${language === lang.code ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-gray-700'}`}
              >
                <span className="text-lg">{lang.flag}</span>
                {lang.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-md w-full flex flex-col items-center text-center z-10">
        
        {/* Graphic Area */}
        <div className={`w-40 h-40 rounded-full flex items-center justify-center mb-8 shadow-xl transition-colors duration-500 ${steps[step].color}`}>
          {steps[step].icon}
        </div>

        {/* Text Content */}
        <div className="space-y-4 mb-12 h-40">
          <h2 className="text-3xl font-bold text-gray-800 font-serif transition-opacity duration-300">
            {steps[step].title}
          </h2>
          <p className="text-gray-500 leading-relaxed text-lg px-4">
            {steps[step].description}
          </p>
        </div>

        {/* Progress Indicators */}
        <div className="flex gap-2 mb-12">
          {steps.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === step ? 'w-8 bg-indigo-600' : 'w-2 bg-gray-300'
              }`}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="w-full flex flex-col gap-3">
          <button 
            onClick={handleNext}
            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {step === steps.length - 1 ? t('get_started') : t('continue')}
            <Icons.ArrowRight size={20} />
          </button>
          
          {step < steps.length - 1 && (
            <button 
              onClick={onComplete}
              className="w-full py-3 text-gray-400 hover:text-gray-600 font-medium transition-colors"
            >
              {t('skip')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};