import { useState } from "react";
import { createProduct } from "../../lib/api";
import { Alert, Button, Field, Input, Select } from "../../components/ui";
import {
  DEFAULT_LOCATION,
  LocationPicker,
  type LatLngValue,
} from "../../components/LocationPicker";

const CROPS = [
  "Tomatoes",
  "Peppers",
  "Onions",
  "Cabbage",
  "Garden Eggs",
  "Okra",
  "Carrots",
  "Lettuce",
  "Other",
];

export function ProductForm({ onCreated }: { onCreated: () => void }) {
  const [cropType, setCropType] = useState(CROPS[0]);
  const [customCrop, setCustomCrop] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState<LatLngValue>(DEFAULT_LOCATION);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const crop = cropType === "Other" ? customCrop.trim() : cropType;
    if (!crop) return setError("Please enter a crop type.");
    if (!image) return setError("Please attach a photo of your produce.");
    if (!quantity || Number(quantity) <= 0) return setError("Enter a valid quantity.");
    if (!price || Number(price) <= 0) return setError("Enter a valid price.");

    setBusy(true);
    try {
      await createProduct({
        crop_type: crop,
        quantity: Number(quantity),
        unit,
        price_per_unit: Number(price),
        location_lat: Number(location.lat),
        location_lng: Number(location.lng),
        image,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list produce.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert kind="error">{error}</Alert>}

      <Field label="Crop type">
        <Select value={cropType} onChange={(e) => setCropType(e.target.value)}>
          {CROPS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>

      {cropType === "Other" && (
        <Field label="Specify crop">
          <Input
            value={customCrop}
            onChange={(e) => setCustomCrop(e.target.value)}
            placeholder="e.g. Sweet potato"
          />
        </Field>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <Field label="Quantity">
            <Input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="100"
            />
          </Field>
        </div>
        <div className="col-span-1">
          <Field label="Unit">
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="kg">kg</option>
              <option value="basket">basket</option>
              <option value="crate">crate</option>
              <option value="bag">bag</option>
            </Select>
          </Field>
        </div>
        <div className="col-span-1">
          <Field label={`Price / ${unit} (GHS)`}>
            <Input
              type="number"
              min="0"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="12.50"
            />
          </Field>
        </div>
      </div>

      <Field label="Produce photo">
        <input
          type="file"
          accept="image/*"
          onChange={onImageChange}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
        />
      </Field>

      {preview && (
        <img
          src={preview}
          alt="preview"
          className="h-32 w-full rounded-lg object-cover"
        />
      )}

      <LocationPicker
        value={location}
        onChange={setLocation}
        label="Farm / pickup location"
      />

      <Button type="submit" loading={busy} className="w-full">
        Publish listing
      </Button>
    </form>
  );
}
