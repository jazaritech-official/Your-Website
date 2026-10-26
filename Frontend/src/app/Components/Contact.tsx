"use client";

import { Mail, Phone, MapPin, Linkedin, Instagram, Twitter, Facebook } from "lucide-react";
import { useState, FormEvent } from "react";
import axios from "axios";
import { baseUrl, showToast } from "../utils/commonFunctions";
import { useFormAutosave } from "../utils/useFormAutosave";
import { Button, fieldStyles } from "./ui";

const Contact: React.FC = () => {
    const { restore, save, clear } = useFormAutosave<{ name: string; email: string; message: string }>("contact_form_draft");

    const [form, setForm] = useState<{ name: string; email: string; message: string }>(() => {
        const saved = restore();
        return saved ?? { name: "", email: "", message: "" };
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const next = { ...form, [e.target.name]: e.target.value };
        setForm(next);
        save(next);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (!form.name || !form.email || !form.message) {
            showToast("All fields are required", "error");
            return;
        }

        try {
            await axios.post(`${baseUrl}auth/contact`, form);
            clear(); // clear saved draft on successful submission
            showToast("Message sent successfully!", "success");
            setForm({ name: "", email: "", message: "" });
        } catch (err: any) {
            showToast(err?.response?.data?.message || "Failed to send message", "error");
        }
    };

    return (
        <section
            id="contact"
            className="w-full bg-surface/72 px-4 py-16 sm:px-6 md:px-12 lg:px-24"
        >
            <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-12 md:grid-cols-2">
                {/* Left Section */}
                <div className="rounded-card bg-brand-navy p-8 shadow-card md:p-10">
                    <span className="inline-flex rounded-full bg-brand-gold/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold">Support</span>
                    <h2 className="mt-4 text-3xl font-black tracking-tight text-white md:text-4xl">
                        Get in Touch
                    </h2>
                    <p className="mb-8 leading-relaxed text-white/65">
                        We&apos;d love to hear from you. Whether it&apos;s a question, feedback, or just
                        a hello — drop us a message!
                    </p>

                    <div className="space-y-4 text-white/75">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-white/5"><Mail className="text-brand-gold" size={18} aria-hidden /></span>
                            <a
                                href="mailto:Irhasinn@gmail.com"
                                className="transition-colors hover:text-brand-gold hover:underline"
                            >
                                Irhasinn@gmail.com
                            </a>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-white/5"><Phone className="text-brand-gold" size={18} aria-hidden /></span>
                            {/* The protocol was missing (`wa.me/...` resolves as a
                                RELATIVE url, so this link navigated to
                                /wa.me/923323238544 instead of opening WhatsApp).
                                NOTE: the linked number (0332-3238544, matching the
                                Navbar and Footer) still differs from the number
                                displayed here (0343-2710491) — that needs an
                                owner decision; neither number was changed. */}
                            <a href="https://wa.me/923323238544" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-brand-gold hover:underline">
                                0343-2710491
                            </a>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-white/5"><MapPin className="text-brand-gold" size={18} aria-hidden /></span>
                            <span>I.I. Chundrigar Road, Karachi.</span>
                        </div>
                    </div>

                    {/* Social Links */}
                    <div className="mt-8 flex gap-3 border-t border-white/10 pt-6">
                        <a
                            href="https://www.instagram.com/irhasinn/"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Irhas'Inn on Instagram"
                            className="flex h-11 w-11 items-center justify-center rounded-field border border-white/10 bg-white/5 text-[#E4405F] transition-[transform,background-color,color] hover:scale-105 hover:bg-[#E4405F] hover:text-white"
                        >
                            <Instagram size={20} aria-hidden />
                        </a>
                        <a
                            href="https://www.facebook.com/irhasinn"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Irhas'Inn on Facebook"
                            className="flex h-11 w-11 items-center justify-center rounded-field border border-white/10 bg-white/5 text-[#1877F2] transition-[transform,background-color,color] hover:scale-105 hover:bg-[#1877F2] hover:text-white"
                        >
                            <Facebook size={20} aria-hidden />
                        </a>
                    </div>
                </div>

                {/* Right Section: Contact Form */}
                <div className="rounded-card border border-line bg-surface p-8 shadow-card md:p-10">
                    <div className="mb-7 border-b border-line pb-5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold-hover">Message Us</p>
                        <h3 className="mt-2 text-2xl font-black tracking-tight text-brand-navy">How can we help?</h3>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label
                                htmlFor="name"
                                className="mb-1 block text-[13px] font-semibold text-brand-navy"
                            >
                                Your Name
                            </label>
                            <input
                                id="name"
                                name="name"
                                type="text"
                                value={form.name}
                                onChange={handleChange}
                                placeholder="Enter your name"
                                className={fieldStyles({ className: "h-11" })}
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="email"
                                className="mb-1 block text-[13px] font-semibold text-brand-navy"
                            >
                                Your Email
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                value={form.email}
                                onChange={handleChange}
                                placeholder="Enter your email"
                                className={fieldStyles({ className: "h-11" })}
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="message"
                                className="mb-1 block text-[13px] font-semibold text-brand-navy"
                            >
                                Message
                            </label>
                            <textarea
                                id="message"
                                name="message"
                                rows={4}
                                value={form.message}
                                onChange={handleChange}
                                placeholder="Write your message..."
                                className={fieldStyles({ className: "resize-none py-2.5" })}
                            ></textarea>
                        </div>

                        <Button type="submit" variant="gold" size="lg" fullWidth>
                            Send Message
                        </Button>
                    </form>
                </div>
            </div>
        </section>
    );
};

export default Contact;
