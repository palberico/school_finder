import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBQHZDlTy8wgVuluOUdHfS2XmeeQKZMSto",
    authDomain: "school-contacts-fa3f2.firebaseapp.com",
    projectId: "school-contacts-fa3f2",
    storageBucket: "school-contacts-fa3f2.firebasestorage.app",
    messagingSenderId: "39829807234",
    appId: "1:39829807234:web:572a905ff4b7e7762f149b",
    measurementId: "G-KRQ660VM7S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
