import { describe, it, expect } from "vitest"
import { netBalances, simplifyDebts } from "@/features/balances/balanceMath"

describe("netBalances exhaustive", () => {
  it("empty expenses", () => { expect(netBalances([],[],["a","b"])).toEqual({a:0,b:0}) })
  it("single payer multiple splits", () => {
    const net = netBalances([{payers:[{userId:"a",amount:1000}],splits:[{userId:"a",amount:250},{userId:"b",amount:250},{userId:"c",amount:500}]}],[],["a","b","c"])
    expect(net).toEqual({a:750,b:-250,c:-500})
    expect(Object.values(net).reduce((s,v)=>s+v,0)).toBe(0)
  })
  it("multiple expenses conserve total", () => {
    const expenses = Array.from({length:10},(_,i)=>({payers:[{userId:`u${i%3}`,amount:100}],splits:[{userId:"u0",amount:33},{userId:"u1",amount:33},{userId:"u2",amount:34}]}))
    const net = netBalances(expenses as any, [], ["u0","u1","u2"])
    expect(Object.values(net).reduce((a,b)=>a+b,0)).toBe(0)
  })
  it("settlements flip sign correctly", () => {
    const net = netBalances([], [{fromId:"a",toId:"b",amount:500}], ["a","b"])
    expect(net["a"]).toBe(500)
    expect(net["b"]).toBe(-500)
  })
})

describe("simplifyDebts exhaustive", () => {
  it("handles 3 creditors 2 debtors", () => {
    const net={a:300,b:200,c:100,d:-300,e:-300}
    const t=simplifyDebts(net)
    expect(t.reduce((s,x)=>s+x.amount,0)).toBe(600)
    expect(t.length).toBeLessThanOrEqual(4)
  })
  it("amounts preserve total", () => {
    for (let i=0;i<20;i++) {
      const net={a: Math.floor(Math.random()*500)-250, b: Math.floor(Math.random()*500)-250, c: Math.floor(Math.random()*500)-250}
      // normalize to zero sum
      const sum = Object.values(net).reduce((a,b)=>a+b,0)
      net["a"] -= sum
      const t=simplifyDebts(net)
      const totalTransferred = t.reduce((s,x)=>s+x.amount,0)
      const totalDebt = Object.values(net).filter(v=>v<0).reduce((s,v)=>s-v,0)
      expect(totalTransferred).toBe(totalDebt)
    }
  })
  it("no transfers when all zero", () => { expect(simplifyDebts({a:0,b:0,c:0})).toEqual([]) })
  it("handles large numbers", () => {
    const t=simplifyDebts({a: 1000000, b:-1000000})
    expect(t).toEqual([{fromId:"b",toId:"a",amount:1000000}])
  })
  it("deterministic regardless of object key order", () => {
    const n1={a:100,b:-100,c:50,d:-50}
    const n2={d:-50,c:50,b:-100,a:100}
    expect(simplifyDebts(n1)).toEqual(simplifyDebts(n2))
  })
})
