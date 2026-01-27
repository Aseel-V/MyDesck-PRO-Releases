# MyDesck PRO &middot; [![GitHub license](https://img.shields.io/badge/license-Private-blue.svg)](./LICENSE)

> **Professional Travel Agency Dashboard** A local-first, secure, and
> high-performance desktop application for travel agencies, retail, and
> restaurant management.

**MyDesck PRO** is a modern Electron-based application built for businesses that
demand privacy, speed, and offline capability. It features a robust PDF
generation engine, industry-specific modules, and a zero-knowledge architecture
where your data stays on your machine.

---

## 🚀 Key Features

### 🛡️ Enterprise-Grade Security (Local-First)

- **Zero-Knowledge Privacy:** We do not store your business data.
- **Offline Sovereignty:** Full functionality without an internet connection.
- **GDPR/CCPA Ready:** Complete control over data export and deletion.

### 🏢 Industry Modules

1. **Travel & Tourism:** Trip management, dynamic quoting, and client
   directories.
2. **Retail & Supermarket:** Barcode scanning, inventory control, and sales
   analytics.
3. **Restaurants:** Table management, Kitchen Display System (KDS), and digital
   menus.

### 📄 Advanced PDF Engine

- **Professional Invoices:** Auto-generate invoices with your branding.
- **Multi-Language Support:** Native support for **English**, **Arabic** (RTL),
  and **Hebrew** (RTL).
- **Batch Export:** Generate summaries for multiple trips in a single click.
- **Digital Signatures:** Automatically sign documents with your credentials.

---

## 🛠️ Tech Stack

Built with performance and modern standards in mind:

- **Core:** [Electron](https://www.electronjs.org/),
  [React](https://react.dev/), [Vite](https://vitejs.dev/)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **State Management:** TanStack Query
- **PDF Generation:** `pdf-lib`, `jspdf`
- **Database:** `idb-keyval` (Local IndexedDB), Supabase (Optional sync)

---

## ⚡ Getting Started

### Prerequisites

- Node.js 20 or higher
- npm (comes with Node.js)

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Aseel-V/MyDesck-PRO.git
cd MyDesck-PRO
npm ci
```

### Development

Start the development server (Vite + Electron):

```bash
npm run electron:dev
```

---

## 📦 Build & Release

We use **electron-builder** for packaging the application.

### Build Commands

| Platform    | Command            | Output                          |
| :---------- | :----------------- | :------------------------------ |
| **All**     | `npm run build`    | Compiles TS/Vite to `dist/`     |
| **Windows** | `npm run dist:win` | `.exe` installer in `release/`  |
| **macOS**   | `npm run dist:mac` | `.dmg` and `.zip` in `release/` |

### Publishing Releases

To publish a new release to GitHub:

1. **Important:** Ensure you have a `RELEASE_TOKEN` (PAT) set in your repository
   secrets if publishing to a separate release repository.
2. Run the release command:

```bash
npm run release:patch  # Bump patch version & release
npm run release:minor  # Bump minor version & release
```

---

## 📚 Documentation

Detailed documentation for specific systems:

- [**Enterprise Features & Setup**](./ENTERPRISE_FEATURES_SETUP.md) - Security
  verification, industry modules, and CI/CD details.
- [**PDF System Documentation**](./PDF_SYSTEM_DOCUMENTATION.md) - Deep dive into
  the PDF generation logic, customization, and troubleshooting.

---

## 👤 Author

**Aseel-V**

- Email: [Aseelshaheen621@gmail.com](mailto:Aseelshaheen621@gmail.com)
- GitHub: [@Aseel-V](https://github.com/Aseel-V)

---

> Built with ❤️ by Aseel Shaheen
