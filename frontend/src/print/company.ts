export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  pib: string;   // tax id
  mb: string;    // registration number
  bankAccount: string;
}

// TODO(uncle): replace with ELGOR's real legal details before printing anything for customers.
export const COMPANY: CompanyInfo = {
  name: 'ELGOR',
  address: 'Kruševac',
  phone: '+381 ...',
  email: 'office@elgor.rs',
  pib: '000000000',
  mb: '00000000',
  bankAccount: '000-0000000000000-00',
};
