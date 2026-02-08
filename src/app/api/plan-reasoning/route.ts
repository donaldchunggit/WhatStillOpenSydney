import { NextResponse } from "next/server";

type PlanItem = {
  id: string;
  name: string | null;
  suburb: string | null;
  website: string | null;
  eatClubUrl: string | null;
  category: "Restaurant" | "Activity" | "Bar";
};

type ReasoningRequest = {
  datetime: string;
  restaurant: PlanItem;
  activity: PlanItem;
  bar: PlanItem;
};

/**
 * Calculate score factors for a venue to help explain why it was chosen.
 */
function calculateScoreFactors(venue: PlanItem): {
  hasEatClub: boolean;
  hasWebsite: boolean;
} {
  const hasEatClub = Boolean(venue.eatClubUrl);
  const hasWebsite = Boolean(venue.website);

  return {
    hasEatClub,
    hasWebsite,
  };
}

/**
 * Generate AI reasoning using OpenAI API if available, otherwise use rule-based explanation.
 */
async function generateReasoningWithAI(args: ReasoningRequest): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const { datetime, restaurant, activity, bar } = args;

  try {
    const prompt = `You are helping explain why these 3 locations were chosen for a night out in Sydney.

Restaurant: ${restaurant.name || "Unknown"} in ${restaurant.suburb || "Sydney"}
${restaurant.eatClubUrl ? "- Available on EatClub" : ""}
${restaurant.website ? "- Has website for booking" : ""}

Activity: ${activity.name || "Unknown"} in ${activity.suburb || "Sydney"}
${activity.eatClubUrl ? "- Available on EatClub" : ""}
${activity.website ? "- Has website for booking" : ""}

Bar: ${bar.name || "Unknown"} in ${bar.suburb || "Sydney"}
${bar.eatClubUrl ? "- Available on EatClub" : ""}
${bar.website ? "- Has website for booking" : ""}

Plan time: ${new Date(datetime).toLocaleString()}

Selection criteria: Venues were chosen from the top 25% based on:
- How long they stay open (60% weight)
- EatClub availability (25% weight)  
- Having booking information (15% weight)

Write a friendly, concise explanation (2-3 sentences per venue) explaining why each location was selected. Include logistics about suburb proximity if relevant. Format with **bold** headers for each venue section.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // or "gpt-3.5-turbo" for cheaper option
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that explains venue selection decisions in a friendly, concise way.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI API error:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("AI reasoning error:", err);
    return null;
  }
}

/**
 * Generate rule-based reasoning (fallback when AI is not available).
 */
async function generateRuleBasedReasoning(args: ReasoningRequest): Promise<string> {
  const { restaurant, activity, bar } = args;

  const restaurantFactors = calculateScoreFactors(restaurant);
  const activityFactors = calculateScoreFactors(activity);
  const barFactors = calculateScoreFactors(bar);

  const reasons: string[] = [];

  // Restaurant reasoning
  reasons.push(`**Restaurant: ${restaurant.name || "Selected venue"}**`);
  const restaurantReasons: string[] = [];
  if (restaurantFactors.hasEatClub) {
    restaurantReasons.push("available on EatClub for potential discounts");
  }
  if (restaurantFactors.hasWebsite) {
    restaurantReasons.push("has a website for easy booking and information");
  }
  if (restaurant.suburb) {
    restaurantReasons.push(`located in ${restaurant.suburb}`);
  }
  reasons.push(restaurantReasons.length > 0 
    ? `Selected because it ${restaurantReasons.join(", ")}.`
    : "Selected from top-scoring options based on availability and quality.");

  // Activity reasoning
  reasons.push(`\n**Activity: ${activity.name || "Selected venue"}**`);
  const activityReasons: string[] = [];
  if (activityFactors.hasEatClub) {
    activityReasons.push("available on EatClub");
  }
  if (activityFactors.hasWebsite) {
    activityReasons.push("has booking information available");
  }
  if (activity.suburb) {
    activityReasons.push(`in ${activity.suburb}`);
  }
  reasons.push(activityReasons.length > 0
    ? `Chosen because it ${activityReasons.join(", ")}.`
    : "Selected from top-rated options that fit your schedule.");

  // Bar reasoning
  reasons.push(`\n**Bar: ${bar.name || "Selected venue"}**`);
  const barReasons: string[] = [];
  if (barFactors.hasEatClub) {
    barReasons.push("on EatClub for member benefits");
  }
  if (barFactors.hasWebsite) {
    barReasons.push("has a website for details");
  }
  if (bar.suburb) {
    barReasons.push(`located in ${bar.suburb}`);
  }
  reasons.push(barReasons.length > 0
    ? `Picked because it ${barReasons.join(", ")}.`
    : "Selected from the best options for late-night drinks.");

  // Overall logistics
  reasons.push(`\n**Plan Logistics:**`);
  const suburbs = [restaurant.suburb, activity.suburb, bar.suburb].filter(Boolean);
  const uniqueSuburbs = [...new Set(suburbs)];
  if (uniqueSuburbs.length === 1) {
    reasons.push(`All venues are in ${uniqueSuburbs[0]}, making it easy to move between locations.`);
  } else if (uniqueSuburbs.length <= 2) {
    reasons.push(`Venues are in ${uniqueSuburbs.join(" and ")}, keeping travel time minimal.`);
  } else {
    reasons.push(`Venues span ${uniqueSuburbs.length} areas: ${uniqueSuburbs.join(", ")}.`);
  }

  reasons.push(`\nThis plan was selected from the top 25% of venues based on: how long they stay open (60% weight), EatClub availability (25% weight), and having booking information (15% weight).`);

  return reasons.join("\n");
}

/**
 * Main reasoning generator - tries AI first, falls back to rule-based.
 */
async function generateReasoning(args: ReasoningRequest): Promise<string> {
  // Try AI first if API key is available
  const aiReasoning = await generateReasoningWithAI(args);
  if (aiReasoning) {
    return aiReasoning;
  }

  // Fallback to rule-based explanation
  return generateRuleBasedReasoning(args);
}

export async function POST(req: Request) {
  try {
    const body: ReasoningRequest = await req.json();

    if (!body.datetime || !body.restaurant || !body.activity || !body.bar) {
      return NextResponse.json(
        { error: "Missing required fields: datetime, restaurant, activity, bar" },
        { status: 400 }
      );
    }

    const reasoning = await generateReasoning(body);

    return NextResponse.json({ reasoning });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to generate reasoning" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const datetime = searchParams.get("datetime");
    const restaurantId = searchParams.get("r");
    const activityId = searchParams.get("a");
    const barId = searchParams.get("b");

    // Get names and suburbs from query params
    const restaurant: PlanItem = {
      id: restaurantId ?? "",
      name: searchParams.get("rn"),
      suburb: searchParams.get("rs"),
      website: searchParams.get("rw"),
      eatClubUrl: searchParams.get("re"),
      category: "Restaurant",
    };

    const activity: PlanItem = {
      id: activityId ?? "",
      name: searchParams.get("an"),
      suburb: searchParams.get("as"),
      website: searchParams.get("aw"),
      eatClubUrl: searchParams.get("ae"),
      category: "Activity",
    };

    const bar: PlanItem = {
      id: barId ?? "",
      name: searchParams.get("bn"),
      suburb: searchParams.get("bs"),
      website: searchParams.get("bw"),
      eatClubUrl: searchParams.get("be"),
      category: "Bar",
    };

    if (!datetime || !restaurantId || !activityId || !barId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const reasoning = await generateReasoning({ datetime, restaurant, activity, bar });

    return NextResponse.json({ reasoning });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to generate reasoning" },
      { status: 500 }
    );
  }
}