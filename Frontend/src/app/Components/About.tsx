"use client";

import React from "react";
import { Award, Shield, Sparkles, Truck } from "lucide-react";
import { SectionLabel } from "./ui";

const stats = [
  { icon: Award, value: "500+", label: "Happy Customers" },
  { icon: Truck, value: "1000+", label: "Orders Delivered" },
  { icon: Shield, value: "100%", label: "Satisfaction" },
  { icon: Sparkles, value: "50+", label: "Custom Products" },
];

const About: React.FC = () => {
  return (
    <section id="about" className="bg-surface/72 py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Label */}
        <div className="mb-4 flex items-center gap-3">
          <span className="h-px w-6 bg-brand-gold" />
          <SectionLabel>About Us</SectionLabel>
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Left: Content */}
          <div>
            <h2 className="mb-5 text-3xl font-black leading-tight tracking-tight text-brand-navy md:text-4xl">
              Your Vision, <span className="text-brand-gold-hover">Our Craft</span>
            </h2>
            <p className="mb-4 leading-relaxed text-ink-muted">
              At <strong className="text-brand-navy">Irhas&apos;Inn</strong>, we specialize in bringing your
              ideas to life through premium customization. From personalized
              apparel and accessories to unique gifts and home decor, every
              product is crafted with attention to detail and a commitment to
              quality.
            </p>
            <p className="mb-6 leading-relaxed text-ink-muted">
              Whether you&apos;re looking for branded corporate merchandise,
              custom cricket jerseys, printed mugs, or one-of-a-kind birthday
              gifts — we make it easy to design, order, and receive products
              that truly represent you.
            </p>

            {/* Highlight points */}
            <div className="space-y-3 mb-8">
              {[
                "Premium quality materials & printing",
                "Custom designs tailored to your needs",
                "Fast delivery across Pakistan",
                "Easy ordering & dedicated support",
              ].map((point, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-gold/12">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-brand-gold-hover"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-ink">{point}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="group rounded-card border border-line bg-surface p-6 text-center shadow-card transition-[box-shadow,border-color] duration-300 hover:border-brand-gold/40 hover:shadow-card-hover"
                >
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-card bg-brand-gold/12 text-brand-gold-hover transition-colors duration-300 group-hover:bg-brand-gold group-hover:text-white">
                    <Icon size={22} aria-hidden />
                  </div>
                  <p className="text-2xl font-black tracking-tight text-brand-navy md:text-3xl">{stat.value}</p>
                  <p className="mt-1 text-xs font-medium text-ink-muted">{stat.label}</p>
                </div>
              );
            })}

            {/* Brand statement */}
            <div className="col-span-2 rounded-card bg-brand-navy p-6 text-center">
              <p className="mb-1 text-sm font-bold uppercase tracking-wider text-brand-gold">
                Irhas&apos;Inn
              </p>
              <p className="text-sm leading-relaxed text-white/80">
                Customize Product All In One — Premium Quality, Delivered with Care Across Pakistan.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
