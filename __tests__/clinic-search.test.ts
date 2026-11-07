import { describe, expect, it } from "@jest/globals";
import { classifyPlace, cleanAddress, mapFeatures, sortClinics } from "@/utils/clinic-search";

describe("classifyPlace", () => {
  it("uses Geoapify's dermatology category even when the name is generic", () => {
    expect(
      classifyPlace("Dr. Santos Clinic", ["healthcare", "healthcare.clinic_or_praxis.dermatology"]),
    ).toBe("dermatology");
  });

  it("detects dermatology from the name", () => {
    expect(classifyPlace("Glow Skin & Derma Center")).toBe("dermatology");
  });

  it("drops clinics that can't help with skin concerns", () => {
    expect(classifyPlace("Muñoz-Mauleon Children's Diseases & Well-Baby Clinic")).toBe("exclude");
    expect(classifyPlace("Smile Dental Clinic")).toBe("exclude");
    expect(classifyPlace("Bright Eye Center")).toBe("exclude");
    expect(classifyPlace("Clinic A", ["healthcare.clinic_or_praxis.paediatrics"])).toBe("exclude");
    expect(classifyPlace("Clinic B", ["healthcare.dentist"])).toBe("exclude");
  });

  it("keeps hospitals and general clinics", () => {
    expect(classifyPlace("Batangas Medical Center", ["healthcare.hospital"])).toBe("hospital");
    expect(classifyPlace("Lipa Medical & Diagnostic Clinic")).toBe("general");
    expect(classifyPlace("Tita Mangge Medical Mission House")).toBe("general");
  });
});

describe("cleanAddress", () => {
  it("prefers address_line2", () => {
    expect(
      cleanAddress("ABC Clinic", { address_line1: "ABC Clinic", address_line2: "Rizal St, Lipa" }),
    ).toBe("Rizal St, Lipa");
  });

  it("strips a leading name from formatted", () => {
    expect(cleanAddress("ABC Clinic", { formatted: "ABC Clinic, Rizal St, Lipa" })).toBe(
      "Rizal St, Lipa",
    );
  });

  it("never repeats the name as the address", () => {
    expect(
      cleanAddress("ABC Clinic", { address_line2: "ABC Clinic", formatted: "ABC Clinic" }),
    ).toBe("Address unavailable");
  });
});

describe("mapFeatures + sortClinics", () => {
  it("skips unnamed and excluded places and orders dermatology first", () => {
    const features = [
      { properties: { place_id: "1", name: "General Clinic", distance: 500 } },
      { properties: { place_id: "2", name: "Kids Pediatric Clinic", distance: 100 } },
      { properties: { place_id: "3", distance: 50 } },
      {
        properties: {
          place_id: "4",
          name: "City Hospital",
          categories: ["healthcare.hospital"],
          distance: 900,
        },
      },
      { properties: { place_id: "5", name: "Derma Care", distance: 4000 } },
    ];
    const out = sortClinics(mapFeatures(features));
    expect(out.map((c) => c.id)).toEqual(["5", "4", "1"]);
    expect(out[0].specialty).toBe("Dermatology");
  });
});
