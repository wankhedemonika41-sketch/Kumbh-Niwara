import { useEffect, useState } from "react";

const API = "http://localhost:5000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${data.message || "Request failed"}${data.error ? `: ${data.error}` : ""}`);
  return data;
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function authOptions(token, method = "GET", body) {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

function AuthForm({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "pilgrim" });
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    try {
      const data = await request(`/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (mode === "login") onLogin(data);
      else setMessage("Registration successful. Now login.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="card auth-card">
      <h2>{mode === "login" ? "Login" : "Create account"}</h2>
      <form onSubmit={submit}>
        {mode === "register" && <input placeholder="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        <input type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input type="password" placeholder="Password (min 6 characters)" required minLength="6" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {mode === "register" && <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="pilgrim">Pilgrim</option><option value="host">Host</option></select>}
        <button type="submit">{mode === "login" ? "Login" : "Register"}</button>
      </form>
      <p className="message">{message}</p>
      <button className="link-button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }}>
        {mode === "login" ? "Need an account? Register" : "Already registered? Login"}
      </button>
    </section>
  );
}

function PilgrimView({ token }) {
  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ checkIn: "", checkOut: "", guests: 1 });
  const [message, setMessage] = useState("");
  const [bookings, setBookings] = useState([]);

  async function load() {
    try { setProperties((await request("/properties")).properties); } catch (error) { setMessage(error.message); }
  }
  async function loadBookings() {
    try { setBookings((await request("/bookings/my-bookings", authOptions(token))).bookings); } catch (error) { setMessage(error.message); }
  }
  useEffect(() => { load(); loadBookings(); }, []);

  async function book(property) {
    setMessage("");
    try {
      const availability = await request("/bookings/check-availability", { method: "POST", body: JSON.stringify({ propertyId: property._id, ...form, guests: Number(form.guests) }) });
      if (!availability.available) return setMessage(availability.message);
      const bookingResult = await request("/bookings/create", authOptions(token, "POST", { propertyId: property._id, ...form, guests: Number(form.guests) }));
      const order = await request("/payments/create-order", authOptions(token, "POST", { bookingId: bookingResult.booking._id }));
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Razorpay checkout could not load");
      await new Promise((resolve, reject) => {
        const checkout = new window.Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: "Kumbh Niwara",
          description: property.title,
          order_id: order.orderId,
          handler: async (response) => {
            try {
              await request("/payments/verify", authOptions(token, "POST", { bookingId: bookingResult.booking._id, ...response }));
              resolve();
            } catch (error) { reject(error); }
          },
          modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
        });
        checkout.open();
      });
      setMessage("Payment successful. Booking confirmed.");
      setSelected(null);
      loadBookings();
    } catch (error) { setMessage(error.message); }
  }

  return <>
    <h2>Approved homestays</h2>
    <p className="message">{message}</p>
    <div className="grid">{properties.map((property) => <article className="card" key={property._id}>
      <h3>{property.title}</h3><p>{property.location}</p><p>{property.description}</p><strong>₹{property.pricePerNight} / night</strong>
      <button onClick={() => { setSelected(property); setMessage(""); }}>Check dates</button>
    </article>)}</div>
    {selected && <section className="card booking-box"><h3>Book: {selected.title}</h3>
      <input type="date" required value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
      <input type="date" required value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
      <input type="number" min="1" max={selected.maxGuests} value={form.guests} onChange={(e) => setForm({ ...form, guests: e.target.value })} />
      <button onClick={() => book(selected)}>Create booking</button>
      <button className="secondary" onClick={() => setSelected(null)}>Cancel</button>
    </section>}
    <h2>My bookings</h2>
    <div className="grid">{bookings.map((booking) => <article className="card" key={booking._id}><h3>{booking.propertyId?.title || "Property"}</h3><p>{booking.checkIn?.slice(0, 10)} to {booking.checkOut?.slice(0, 10)}</p><p>₹{booking.totalAmount} · {booking.status}</p></article>)}</div>
  </>;
}

function HostView({ token }) {
  const [form, setForm] = useState({ title: "", description: "", location: "", pricePerNight: "", maxGuests: "", amenities: "" });
  const [image, setImage] = useState(null);
  const [message, setMessage] = useState("");
  const [bookings, setBookings] = useState([]);
  async function submit(event) {
    event.preventDefault();
    try {
      let images = [];
      if (image) {
        const body = new FormData();
        body.append("image", image);
        const uploadResponse = await fetch(`${API}/uploads/image`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(`${uploadData.message || "Image upload failed"}${uploadData.error ? `: ${uploadData.error}` : ""}`);
        images = [uploadData.url];
      }
      await request("/properties", authOptions(token, "POST", { ...form, pricePerNight: Number(form.pricePerNight), maxGuests: Number(form.maxGuests), amenities: form.amenities.split(",").map((item) => item.trim()).filter(Boolean), images }));
      setMessage("Property submitted for approval.");
    } catch (error) { setMessage(error.message); }
  }
  useEffect(() => { request("/bookings/host-bookings", authOptions(token)).then((data) => setBookings(data.bookings)).catch(() => {}); }, []);
  return <><section className="card"><h2>Add homestay</h2><form onSubmit={submit}><input placeholder="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><input placeholder="Location" required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /><textarea placeholder="Description" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><input type="number" min="1" placeholder="Price per night" required value={form.pricePerNight} onChange={(e) => setForm({ ...form, pricePerNight: e.target.value })} /><input type="number" min="1" placeholder="Maximum guests" required value={form.maxGuests} onChange={(e) => setForm({ ...form, maxGuests: e.target.value })} /><input placeholder="Amenities separated by comma" value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} /><input type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0])} /><button type="submit">Submit property</button></form><p className="message">{message}</p></section><h2>Received bookings</h2><div className="grid">{bookings.map((booking) => <article className="card" key={booking._id}><h3>{booking.propertyId?.title}</h3><p>{booking.pilgrimId?.name} · {booking.status}</p><p>{booking.checkIn?.slice(0, 10)} to {booking.checkOut?.slice(0, 10)}</p></article>)}</div></>;
}

function AdminView({ token }) {
  const [properties, setProperties] = useState([]);
  const [message, setMessage] = useState("");
  async function load() { try { setProperties((await request("/admin/properties/pending", authOptions(token))).properties); } catch (error) { setMessage(error.message); } }
  useEffect(() => { load(); }, []);
  async function decide(id, action) { try { await request(`/admin/properties/${id}/${action}`, authOptions(token, "PATCH")); load(); } catch (error) { setMessage(error.message); } }
  return <><h2>Pending properties</h2><p className="message">{message}</p><div className="grid">{properties.map((property) => <article className="card" key={property._id}><h3>{property.title}</h3><p>{property.hostId?.name} · {property.location}</p><button onClick={() => decide(property._id, "approve")}>Approve</button><button className="danger" onClick={() => decide(property._id, "reject")}>Reject</button></article>)}</div></>;
}

export default function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem("kumbhSession") || "null"));
  function login(data) { const next = { token: data.token, user: data.user }; localStorage.setItem("kumbhSession", JSON.stringify(next)); setSession(next); }
  function logout() { localStorage.removeItem("kumbhSession"); setSession(null); }
  return <main><header><h1>Kumbh Niwara</h1>{session && <div><span>{session.user.name} ({session.user.role})</span><button className="secondary" onClick={logout}>Logout</button></div>}</header>{!session ? <AuthForm onLogin={login} /> : session.user.role === "host" ? <HostView token={session.token} /> : session.user.role === "admin" ? <AdminView token={session.token} /> : <PilgrimView token={session.token} />}</main>;
}
