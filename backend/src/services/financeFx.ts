import { Prisma } from "@prisma/client";
import { amount, date, FinanceError, text } from "./projectFinance";
export type Fx = { currency:string; rate:string; rateDate:string; rateSource:string; netMinor:number; taxMinor:number };
export function readFx(value:unknown):Fx|null { return value && typeof value==='object' && 'currency' in value ? value as Fx : null; }
// Rates are base currency per one source unit. Integer arithmetic, half-up to cents.
export function convertMinor(minor:number,rate:string) {
  if(!/^\d{1,3}(\.\d{1,6})?$/.test(rate)||Number(rate)<=0)throw new FinanceError('Exchange rate must be positive, with up to six decimal places.');
  const [whole,fraction='']=rate.split('.');const scaled=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
  const result=Number((BigInt(minor)*scaled+500000n)/1000000n);
  if(!Number.isSafeInteger(result)||result>1_000_000_000)throw new FinanceError('Converted amount exceeds the supported range.');return result;
}
export function fxInput(raw:unknown,base:string,net:unknown,tax:unknown='0',fixed?:Fx|null) {
  if(raw&&typeof raw!=='object')throw new FinanceError('Invalid supplier currency details.');
  if(!raw)return {fx:Prisma.DbNull,netMinor:amount(net,'Net'),taxMinor:amount(tax,'Tax')};
  const input=raw as Record<string,unknown>;const currency=String(input.currency||base);
  if(currency===base)return {fx:Prisma.DbNull,netMinor:amount(net,'Net'),taxMinor:amount(tax,'Tax')};
  if(!['GBP','EUR','USD','CHF','CAD','AUD'].includes(currency))throw new FinanceError('Choose a supported supplier currency.');
  if(fixed&&fixed.currency!==currency)throw new FinanceError('Credit currency must match the original invoice.');
  const rate=fixed?.rate??text(input.rate,'Exchange rate',20);convertMinor(0,rate);
  const rateDate=fixed?.rateDate??text(input.rateDate,'Rate date',10);if(date(rateDate,'Rate date')>new Date())throw new FinanceError('Rate date cannot be in the future.');
  const rateSource=fixed?.rateSource??text(input.rateSource,'Rate source',300);
  const netMinor=amount(net,'Original net'),taxMinor=amount(tax,'Original tax');
  const fx:Fx={currency,rate,rateDate,rateSource,netMinor,taxMinor};
  return {fx,netMinor:convertMinor(netMinor,rate),taxMinor:convertMinor(taxMinor,rate)};
}
type Cash={amountMinor:number;sourceAmountMinor?:number|null;bankAmountMinor?:number|null;bankFeeMinor?:number;direction:string;reversedAt:Date|null};
export function cashAdjustments(payments:Cash[]) {
 let bankPaidMinor=0,fxDifferenceMinor=0,bankFeesMinor=0;
 for(const p of payments.filter(p=>!p.reversedAt)){const sign=p.direction==='REFUND'?-1:1;const bank=p.bankAmountMinor??p.amountMinor;bankPaidMinor+=sign*bank+(p.bankFeeMinor||0);fxDifferenceMinor+=sign*(bank-p.amountMinor);bankFeesMinor+=p.bankFeeMinor||0;}
 return {bankPaidMinor,fxDifferenceMinor,bankFeesMinor,settlementAdjustmentMinor:fxDifferenceMinor+bankFeesMinor};
}
