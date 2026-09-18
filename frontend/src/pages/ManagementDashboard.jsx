import React from "react";

export default function ManagementDashboard() {
  return (
    <div>
      <h1>داشبورد مدیریت کارخانه</h1>

      <section>
        <h3>وضعیت تولید</h3>
        <p>تولید امروز</p>
        <p>تولید سالم</p>
        <p>معیوب</p>
      </section>

      <section>
        <h3>وضعیت فروش</h3>
        <p>فروش روزانه</p>
        <p>مبلغ فروش</p>
        <p>بدهی مشتریان</p>
      </section>

      <section>
        <h3>موجودی لحظه‌ای</h3>
        <p>موجودی هر نوع سبد</p>
      </section>
    </div>
  );
}
