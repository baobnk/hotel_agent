/**
 * Hotel Statistics Module
 * Loads statistics from hotel_statistics.json file
 */

import hotelStatistics from "../../data/hotel_statistics.json";

export interface LocationStatistics {
  location: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  medianPrice: number;
  totalHotels: number;
  activeHotels: number;
}

export interface TierStatistics {
  tier: "Budget" | "Mid-tier" | "Luxury";
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  medianPrice: number;
  count: number;
  recommendedRange: {
    min: number;
    max: number;
    typical: string;
  };
}

/**
 * Get statistics for a specific location
 */
export function getLocationStatistics(location: string): LocationStatistics | null {
  const locationKey = location as keyof typeof hotelStatistics.prices.by_location;
  const stats = hotelStatistics.prices.by_location[locationKey];
  
  if (!stats) return null;
  
  // Get active hotels count from locations data
  const activeCount = hotelStatistics.locations.active_by_location[locationKey as keyof typeof hotelStatistics.locations.active_by_location] || 0;
  
  return {
    location,
    minPrice: stats.min,
    maxPrice: stats.max,
    avgPrice: stats.avg,
    medianPrice: stats.median,
    totalHotels: stats.count,
    activeHotels: activeCount
  };
}

/**
 * Get statistics for a specific tier
 */
export function getTierStatistics(tier: "Budget" | "Mid-tier" | "Luxury"): TierStatistics | null {
  const tierKey = tier as keyof typeof hotelStatistics.prices.by_tier;
  const stats = hotelStatistics.prices.by_tier[tierKey];
  const recommendation = hotelStatistics.tier_analysis.recommendation[tierKey];
  
  if (!stats || !recommendation) return null;
  
  return {
    tier,
    minPrice: stats.min,
    maxPrice: stats.max,
    avgPrice: stats.avg,
    medianPrice: stats.median,
    count: stats.count,
    recommendedRange: {
      min: recommendation.min === 0 ? 0 : recommendation.min,
      max: recommendation.max === Infinity ? 9999 : recommendation.max,
      typical: recommendation.typical
    }
  };
}

/**
 * Get all available locations
 */
export function getAllLocations(): string[] {
  return hotelStatistics.locations.unique_locations;
}

/**
 * Get price statistics for active hotels only
 */
export function getActiveHotelsStatistics() {
  return {
    minPrice: hotelStatistics.prices.active_hotels.min,
    maxPrice: hotelStatistics.prices.active_hotels.max,
    avgPrice: hotelStatistics.prices.active_hotels.avg,
    medianPrice: hotelStatistics.prices.active_hotels.median,
    count: hotelStatistics.prices.active_hotels.count
  };
}

/**
 * Get recommended price range for a tier
 */
export function getRecommendedPriceRange(tier: "Budget" | "Mid-tier" | "Luxury"): { min: number; max: number; typical: string } | null {
  const recommendation = hotelStatistics.tier_analysis.recommendation[tier];
  if (!recommendation) return null;
  
  return {
    min: recommendation.min === 0 ? 0 : recommendation.min,
    max: recommendation.max === Infinity ? 9999 : recommendation.max,
    typical: recommendation.typical
  };
}

