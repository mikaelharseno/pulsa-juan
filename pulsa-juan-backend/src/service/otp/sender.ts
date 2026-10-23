// OTP delivery. v1 only logs the code; a WhatsApp/SMS gateway implements
// OtpSender later and is swapped in with setOtpSender (tests do the same).

export interface OtpSender {
  send(phone: string, code: string, purpose: string): Promise<void>;
}

export class ConsoleOtpSender implements OtpSender {
  async send(phone: string, code: string, purpose: string) {
    console.log(`[otp] ${purpose} ${phone}: ${code}`);
  }
}

let sender: OtpSender = new ConsoleOtpSender();

export function getOtpSender(): OtpSender {
  return sender;
}

export function setOtpSender(s: OtpSender) {
  sender = s;
}
