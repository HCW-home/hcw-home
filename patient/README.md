# Setup Instructions

## Getting Started

This guide walks you through running an **Ionic Angular** app on a physical **Android device**.

### Prerequisites

- Node.js (v16 or higher)
- Yarn package manager
- Java JDK (v11 or higher)
- Android Studio (latest) https://developer.android.com/studio

### Installation Steps

**Clone the repository and install dependencies**

```bash
git clone https://github.com/HCW-home/hcw-home.git
cd hcw-home/patient
yarn install
```

### Run on Android Device

1. **Connect your Android device**

- Enable Developer Options on your phone
- Enable USB Debugging
- Connect phone via USB

To check if the device is recognized:

```bash
adb devices
```

2. **Add Android Platform**

```bash
ionic capacitor add android
```

3. **Build Web Assets**

```bash
ionic build
```

4. **Copy Web Assets to Native Project**

```bash
npx cap copy
```

5. **Open Android Studio**

```bash
npx cap open android
```

- This will open your project inside Android Studio
- Select your connected device or emulator
- Click Run ▶️

### if you make changes in the codebase, so to reflect changes in android device

1. **Build Web Assets**
```bash
ionic build
```

2. **Copy Web Assets to Native Project**

- if you only change only web code (HTML/CSS/TS/Angular logic)

```bash
npx cap copy
```

- If you just added a new plugin, or edited capacitor.config.ts

```bash
npx cap sync
```

3. **Open Android Studio**

```bash
npx cap open android
```

- This will open your project inside Android Studio
- Select your connected device or emulator(Auto selected-previous one)
- Click refresh button





# Application
PORT=8100

## **Start the Application on web**

```bash
yarn start:dev
```

Your Ionic Angular application should now be running at `http://localhost:8100`

