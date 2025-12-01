<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Lumina Reader

An elegant EPUB reader with an integrated AI reading assistant powered by Grok AI. Upload books, select text, and get instant explanations, translations, or summaries.

## Features

- 📚 **EPUB Reading**: Clean, distraction-free interface for reading EPUB books
- 🤖 **AI Reading Assistant**: Powered by Grok AI - highlight text for instant explanations, translations, or summaries
- 🎨 **Customizable Themes**: Light, sepia, and dark modes with adjustable font sizes
- 🔖 **Bookmarks**: Save your reading positions and favorite passages
- 🌍 **Multi-language Support**: Available in 7 languages
- 📱 **Responsive Design**: Optimized for both desktop and mobile

## Run Locally

**Prerequisites:** Node.js (v18 or higher)

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd lumina-reader
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env`
   - Get your Grok API key from [https://console.x.ai/](https://console.x.ai/)
   - Add your API key to `.env`:
     ```
     VITE_GROK_API_KEY=your_grok_api_key_here
     ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   - Navigate to `http://localhost:3000`

## Build for Production

```bash
npm run build
npm run preview
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS
- **EPUB Processing**: epub.js
- **AI Integration**: Grok API (xAI)
- **Markdown Rendering**: react-markdown

## Project Structure

```
lumina-reader/
├── components/        # React components
├── services/          # API services (Grok AI)
├── contexts/          # React contexts (Language)
├── utils/             # Utility functions (translations)
├── types.ts           # TypeScript type definitions
├── App.tsx            # Main application component
└── index.tsx          # Application entry point
```

## Roadmap

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the full development roadmap including:
- Native iOS and Android apps (Capacitor)
- Real authentication and database
- In-app purchases
- App Store and Play Store deployment

## License

MIT License - See LICENSE file for details
