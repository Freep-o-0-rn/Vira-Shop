"use client";
import {useEffect,useRef} from "react";
import {normalizeVerificationCode} from "@/lib/verification-code";

type Props={
 id:string;
 value:string;
 onChange:(value:string)=>void;
 disabled?:boolean;
 autoFocus?:boolean;
};

export default function OtpCodeInput({id,value,onChange,disabled=false,autoFocus=false}:Props){
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(autoFocus)input.current?.focus();},[autoFocus]);
 return <div className={"buyer-otp-wrapper"+(disabled?" buyer-otp-disabled":"")}>
   <input
    ref={input}
    id={id}
    type="text"
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="[0-9]{6}"
    aria-label="Шестизначный код из письма"
    aria-describedby={id+"-hint"}
    className="buyer-otp-native-input"
    value={value}
    onChange={e=>onChange(normalizeVerificationCode(e.target.value))}
    onPaste={e=>{
      const normalized=normalizeVerificationCode(e.clipboardData.getData("text"));
      if(normalized.length===6){e.preventDefault();onChange(normalized);}
    }}
    required
    disabled={disabled}
   />
   <div aria-hidden="true" className="buyer-otp-digits">
    {Array.from({length:6},(_,i)=><span key={i} className={"buyer-otp-digit"+(value[i]?" buyer-otp-filled":"")}>
      {value[i]||<span className="buyer-otp-underscore"/>}
    </span>)}
   </div>
  </div>;
}
