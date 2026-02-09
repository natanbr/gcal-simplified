import React from 'react';
import {
    Cloud, CloudDrizzle, CloudFog, CloudLightning,
    CloudRain, CloudSnow, Sun
} from 'lucide-react';

export const getWeatherIcon = (code: number) => {
    if (code === 0) return <Sun className="text-yellow-500" />;
    if (code >= 1 && code <= 3) return <Cloud className="text-zinc-400" />;
    if (code >= 45 && code <= 48) return <CloudFog className="text-zinc-500" />;
    if (code >= 51 && code <= 67) return <CloudDrizzle className="text-blue-400" />;
    if (code >= 71 && code <= 77) return <CloudSnow className="text-zinc-400 dark:text-white" />;
    if (code >= 80 && code <= 82) return <CloudRain className="text-blue-500" />;
    if (code >= 95) return <CloudLightning className="text-yellow-600" />;
    return <Sun className="text-yellow-500" />;
};
