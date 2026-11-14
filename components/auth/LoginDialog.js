"use client";
import { X } from 'lucide-react';
import Modal from '../Modal';
import AccountForm from './AccountForm';
export default function LoginDialog({onClose}) {
  return <Modal titleId="account-login-title" onClose={onClose}><div className="relative"><button type="button" onClick={onClose} aria-label="Close login popup" autoFocus className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"><X size={19} aria-hidden="true"/></button><AccountForm onClose={onClose}/></div></Modal>;
}
