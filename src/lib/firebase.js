import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCW8V5elCYinG2sy9U0ARV_km2Mi7dVPxI",
    authDomain: "shopify-theme-dev-12b7d.firebaseapp.com",
    projectId: "shopify-theme-dev-12b7d",
    storageBucket: "shopify-theme-dev-12b7d.firebasestorage.app",
    messagingSenderId: "58640671067",
    appId: "1:58640671067:web:abcd3b9391c06b3985ba7e",
    measurementId: "G-VVQ7ZDKF8W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
