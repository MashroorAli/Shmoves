import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB7rico61ZoEB7ibxsW1b0vmUr2gBQNnuk',
  authDomain: 'tripplanner-49d94.firebaseapp.com',
  projectId: 'tripplanner-49d94',
  storageBucket: 'tripplanner-49d94.firebasestorage.app',
  messagingSenderId: '286603017670',
  appId: '1:286603017670:web:fa70e4919f69cf305c46c7',
  measurementId: 'G-868Q6C5D23',
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
