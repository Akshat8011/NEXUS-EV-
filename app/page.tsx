"use client";
import React, { useEffect, useState } from 'react';
import { useSimulation } from '../hooks/useSimulation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Text } from 'recharts';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Reusable LabelFrame component mimicking Tkinter
const LabelFrame = ({ title, children, className }: { title: string, children: React.ReactNode, className?: string }) => (
  <fieldset className={cn("border border-gray-400 p-3 rounded bg-frame mb-3", className)}>
    <legend className="text-white font-bold px-1 text-[11px]">{title}</legend>
    {children}
  </fieldset>
);

// Reusable Button mimicking Tkinter
const TkButton = ({ children, onClick, disabled, className }: any) => (
  <button 
    className={cn(
      "w-full font-bold py-1.5 px-2 text-sm text-root transition-colors",
      disabled ? "bg-disabled text-disabledText cursor-not-allowed" : "bg-accent hover:bg-ev cursor-pointer",
      className
    )}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
);

export default function Dashboard() {
  const sim = useSimulation();
  const [weather, setWeather] = useState<any>(null);
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  
  useEffect(() => {
    fetch('/api/weather').then(r => r.json()).then(data => setWeather(data)).catch(console.error);
  }, []);

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  return (
    <div className="flex h-screen bg-root text-white overflow-hidden p-2 gap-2">
      {/* LEFT PANEL: Controls */}
      <div className="w-[320px] bg-root flex flex-col overflow-y-auto shrink-0 pr-2 custom-scrollbar">
        
        <LabelFrame title="Simulation Control">
          <TkButton 
            onClick={sim.startSim}
            disabled={sim.isRunning && sim.timeStep > 0}
            className="mb-2"
          >
            Start 24-Hour Day
          </TkButton>
          <div className="flex gap-2">
            <TkButton 
              onClick={sim.pauseSim}
              disabled={!sim.isRunning}
            >
              Pause Simulation
            </TkButton>
            <TkButton 
              onClick={() => sim.startSim()}
              disabled={sim.isRunning || sim.timeStep===0}
            >
              Resume Simulation
            </TkButton>
          </div>
        </LabelFrame>

        <LabelFrame title="System Status">
          <div className="text-xs mb-1">Current Time:</div>
          <div className="text-xl font-bold mb-2">{formatTime(sim.timeStep)}</div>
          
          <div className="w-full bg-root h-4 overflow-hidden mb-1 border border-gray-500">
            <div className="bg-accent h-full" style={{ width: `${sim.evSoc}%` }} />
          </div>
          <div className="font-bold text-sm mb-1">EV SOC: {sim.evSoc.toFixed(1)}%</div>
          <div className="text-xs mb-3">Range: {((sim.evSoc/100)*sim.evMaxRangeKm).toFixed(1)} km</div>
          
          <div className={cn("font-bold text-lg", 
            sim.mode.includes("BLACKOUT") ? "text-red-500" :
            sim.mode.includes("V2H") ? "text-orange-500" :
            sim.mode.includes("Driving") ? "text-[#EBCB8B]" : "text-[#5294E2]"
          )}>Mode: {sim.mode}</div>

          <div className={cn("font-bold text-sm mt-1", sim.isEvPluggedIn ? "text-[#A3BE8C]" : "text-[#BF616A]")}>
            EV: {sim.isEvPluggedIn ? "Plugged In" : "Unplugged"}
          </div>
        </LabelFrame>

        <LabelFrame title="Weather (Lucknow)">
          {weather?.current?.weather ? (
            <div className="text-center">
              <div className="font-bold text-lg">{weather.current.weather[0].main}</div>
              <div className="text-sm">{weather.current.main.temp.toFixed(1)}°C</div>
              <div className="text-xs">Vis: {(weather.current.visibility/1000).toFixed(1)} km</div>
              <div className="text-xs">UV Index: 2 (Est.)</div>
              {weather.air_pollution?.list?.[0]?.components && (
                <div className="text-xs font-bold mt-1 text-[#A3BE8C]">
                  PM2.5: {weather.air_pollution.list[0].components.pm2_5.toFixed(1)} µg/m³
                </div>
              )}
            </div>
          ) : weather?.error || weather?.current?.cod ? (
            <div className="text-center text-sm text-red-400">Weather API Error</div>
          ) : (
            <div className="text-center text-sm">Loading...</div>
          )}
          <TkButton disabled className="mt-2 text-xs">Show 5-Day Forecast</TkButton>
        </LabelFrame>

        <LabelFrame title="User Settings">
          <div className="text-xs mb-1">V2G Reserve Range:</div>
          <div className="text-[10px] italic mb-2">{sim.minRangeKm} km + 50km buffer = {sim.minRangeKm + 50}km</div>
          <input 
            type="range" min="0" max="450" 
            value={sim.minRangeKm} 
            onChange={(e) => sim.setMinRangeKm(Number(e.target.value))}
            className="w-full accent-accent bg-root h-1 rounded appearance-none"
          />
        </LabelFrame>

        <LabelFrame title="Grid Services">
          <div className={cn("font-bold text-center mb-2", sim.gridIsDown ? "text-[#BF616A]" : "text-[#A3BE8C]")}>
            Grid: {sim.gridIsDown ? "OFFLINE" : "CONNECTED"}
          </div>
          <TkButton onClick={() => sim.setGridIsDown(true)} className="mb-2">
            Simulate Grid Failure
          </TkButton>
          <TkButton onClick={() => sim.setGridIsDown(false)}>
            Restore Grid Power
          </TkButton>
        </LabelFrame>

        <LabelFrame title="EV Trip">
          <TkButton onClick={() => setIsTripModalOpen(true)}>Open My EV Trip</TkButton>
        </LabelFrame>

        <LabelFrame title="Financials">
          <div className="font-bold text-center text-lg">
            Net Profit: ₹{(sim.totalEarnings - sim.totalCost).toFixed(2)}
          </div>
        </LabelFrame>
      </div>

      {/* RIGHT PANEL: Diagram + Charts side-by-side like Tkinter PanedWindow */}
      <div className="flex-1 flex flex-row gap-2 bg-frame overflow-hidden p-2 rounded">
        {/* SVG DIAGRAM (Left pane) */}
        <div className="w-[45%] h-full relative border-r-2 border-root pr-2">
          <PowerFlowDiagram sim={sim} />
        </div>

        {/* CHARTS (Right pane) */}
        <div className="w-[55%] h-full flex flex-col gap-2 pl-2">
          
          <ChartWrapper title="Battery SOC (%)" yLabel="SOC (%)">
            <LineChart data={sim.history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" type="number" domain={[0, 24]} ticks={[0,5,10,15,20]} tickFormatter={(val)=>val.toString()} />
              <YAxis domain={[0, 100]} ticks={[0,20,40,60,80,100]} />
              <Tooltip />
              <Legend verticalAlign="top" height={36} iconType="plainline" wrapperStyle={{fontSize: '10px'}}/>
              <Line type="stepAfter" dataKey="evSoc" stroke="green" name="EV SOC" dot={false} strokeWidth={1.5} isAnimationActive={false}/>
              <Line type="stepAfter" dataKey="homeBatterySoc" stroke="blue" strokeDasharray="5 5" name="Home Battery SOC" dot={false} strokeWidth={1.5} isAnimationActive={false}/>
            </LineChart>
          </ChartWrapper>
          
          <ChartWrapper title="Home Power Sources (kW)" yLabel="Power (kW)">
            <LineChart data={sim.history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" type="number" domain={[0, 24]} ticks={[0,5,10,15,20]} />
              <YAxis domain={[0, 10]} ticks={[0,2,4,6,8,10]} />
              <Tooltip />
              <Legend verticalAlign="top" height={36} iconType="plainline" wrapperStyle={{fontSize: '10px'}}/>
              <Line type="stepAfter" dataKey="solarToHouse" stroke="orange" name="From Solar" dot={false} isAnimationActive={false} strokeWidth={1.5}/>
              <Line type="stepAfter" dataKey="evToHouse" stroke="green" name="From EV (V2H)" dot={false} isAnimationActive={false} strokeWidth={1.5}/>
              <Line type="stepAfter" dataKey="gridToHouse" stroke="red" name="From Grid" dot={false} isAnimationActive={false} strokeWidth={1.5}/>
            </LineChart>
          </ChartWrapper>

          <ChartWrapper title="Grid Interaction (kW)" yLabel="Power (kW)" xLabel="Time (hour)">
            <LineChart data={sim.history} margin={{ top: 10, right: 10, left: 0, bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" type="number" domain={[0, 24]} ticks={[0,5,10,15,20]} />
              <YAxis domain={[-5, 5]} ticks={[-4, -2, 0, 2, 4]} />
              <Tooltip />
              <Line type="stepAfter" dataKey="gridNet" stroke="purple" name="Grid Net (kW)" dot={false} strokeWidth={1.5} isAnimationActive={false}/>
            </LineChart>
          </ChartWrapper>

        </div>
      </div>

      {/* EV Trip Modal */}
      {isTripModalOpen && <EVTripModal onClose={() => setIsTripModalOpen(false)} evSoc={sim.evSoc} evMaxRange={sim.evMaxRangeKm} />}
    </div>
  );
}

// Wrapper for Recharts to look like Matplotlib
function ChartWrapper({ title, yLabel, children, xLabel }: { title: string, yLabel: string, children: React.ReactNode, xLabel?: string }) {
  return (
    <div className="h-1/3 w-full bg-white text-black relative border border-gray-400 flex flex-col">
      <div className="text-center text-xs font-bold pt-1">{title}</div>
      <div className="absolute left-[-10px] top-1/2 -rotate-90 text-[10px] origin-center -translate-y-1/2 -translate-x-1/2">{yLabel}</div>
      {xLabel && <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] z-10">{xLabel}</div>}
      <div className="flex-1 pb-1 pr-1 pl-4">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// EV Trip Modal mimicking the Toplevel window
function EVTripModal({ onClose, evSoc, evMaxRange }: { onClose: () => void, evSoc: number, evMaxRange: number }) {
  const [startLoc, setStartLoc] = useState("Lucknow");
  const [endLoc, setEndLoc] = useState("Delhi");
  const [soc, setSoc] = useState(evSoc.toFixed(0));
  const [routeStatus, setRouteStatus] = useState("Enter details and check your route.");
  const [isCheckingRoute, setIsCheckingRoute] = useState(false);

  const [findLoc, setFindLoc] = useState("Lucknow");
  const [findStatus, setFindStatus] = useState("Enter a location to find chargers.");
  const [chargers, setChargers] = useState<any[]>([]);
  const [isFinding, setIsFinding] = useState(false);

  const checkRoute = async () => {
    setIsCheckingRoute(true);
    setRouteStatus("Checking route... Fetching coordinates...");
    try {
      const res = await fetch('/api/route-adviser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startLoc, endLoc })
      });
      const data = await res.json();
      if (data.error) {
        setRouteStatus(`Error: ${data.error}`);
      } else {
        const dist = data.distanceKm;
        const currentRange = (Number(soc) / 100) * evMaxRange;
        let msg = `Total Distance: ${dist.toFixed(1)} km.\nYour Current Range: ${currentRange.toFixed(1)} km.\n\n`;
        if (dist > (currentRange - 50)) {
          msg += `ADVICE: You will need to charge. You need ~${(dist + 50).toFixed(1)} km of range (including buffer).`;
        } else {
          msg += "ADVICE: You have enough range to make this trip!";
        }
        setRouteStatus(msg);
      }
    } catch (e: any) {
      setRouteStatus(`Error: ${e.message}`);
    }
    setIsCheckingRoute(false);
  };

  const findChargers = async () => {
    setIsFinding(true);
    setFindStatus(`Finding chargers near ${findLoc}...`);
    try {
      const res = await fetch(`/api/chargers?location=${encodeURIComponent(findLoc)}`);
      const data = await res.json();
      if (data.error) {
        setFindStatus(`Error: ${data.error}`);
      } else {
        setChargers(data.chargers || []);
        if (data.chargers?.length === 0) {
          setFindStatus("No chargers found within 25km of that location.");
        } else {
          setFindStatus(`Found ${data.chargers.length} chargers near ${findLoc}.`);
        }
      }
    } catch (e: any) {
      setFindStatus(`Error: ${e.message}`);
    }
    setIsFinding(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-frame w-[500px] max-h-[90vh] overflow-y-auto rounded shadow-lg border border-accent p-4 relative">
        <button className="absolute top-2 right-2 text-white font-bold" onClick={onClose}>X</button>
        <h2 className="text-lg font-bold text-white mb-4">My EV Trip</h2>

        <LabelFrame title="Route Adviser">
          <div className="flex flex-col gap-2 mb-2 text-sm">
            <div className="flex items-center"><span className="w-32">Start Location:</span><input className="flex-1 bg-input px-2 py-1 rounded" value={startLoc} onChange={e=>setStartLoc(e.target.value)} /></div>
            <div className="flex items-center"><span className="w-32">End Location:</span><input className="flex-1 bg-input px-2 py-1 rounded" value={endLoc} onChange={e=>setEndLoc(e.target.value)} /></div>
            <div className="flex items-center"><span className="w-32">Starting SOC (%):</span><input className="w-24 bg-input px-2 py-1 rounded" value={soc} onChange={e=>setSoc(e.target.value)} /></div>
          </div>
          <TkButton onClick={checkRoute} disabled={isCheckingRoute}>Check Route</TkButton>
          <div className="text-sm italic mt-2 whitespace-pre-wrap">{routeStatus}</div>
        </LabelFrame>

        <LabelFrame title="Find Nearby Chargers" className="mt-4">
          <div className="flex items-center gap-2 mb-2 text-sm">
            <span>Location:</span>
            <input className="flex-1 bg-input px-2 py-1 rounded" value={findLoc} onChange={e=>setFindLoc(e.target.value)} />
          </div>
          <TkButton onClick={findChargers} disabled={isFinding}>Find Chargers</TkButton>
          <div className="text-sm italic mt-2">{findStatus}</div>
          
          <div className="mt-4 bg-input rounded overflow-hidden text-xs">
            <div className="flex bg-root font-bold p-2 border-b border-gray-500">
              <div className="w-[120px]">Charger Name</div>
              <div className="flex-1">Address</div>
              <div className="w-[60px] text-center">Speed</div>
              <div className="w-[60px] text-center">Available</div>
            </div>
            <div className="max-h-[150px] overflow-y-auto">
              {chargers.map((c, i) => (
                <div key={i} className="flex p-2 border-b border-gray-600 hover:bg-accent hover:text-root cursor-pointer">
                  <div className="w-[120px] truncate pr-2">{c.title}</div>
                  <div className="flex-1 truncate pr-2">{c.address}</div>
                  <div className="w-[60px] text-center">{c.speed}kW</div>
                  <div className="w-[60px] text-center">{c.available}</div>
                </div>
              ))}
            </div>
          </div>
        </LabelFrame>

      </div>
    </div>
  );
}

// Subcomponent for SVG Diagram
function PowerFlowDiagram({ sim }: { sim: any }) {
  return (
    <div className="w-full h-full relative">
      <svg viewBox="0 0 1000 500" className="w-full h-full">
        {/* Nodes */}
        {/* Grid */}
        <circle cx="200" cy="250" r="40" fill={sim.gridIsDown ? "#5e636e" : "#BF616A"} stroke="white" strokeWidth="2" />
        <text x="200" y="250" textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="bold" fontSize="12">GRID</text>
        <text x="200" y="305" textAnchor="middle" fill="white" fontSize="12">{Math.abs(sim.powerLabels.grid).toFixed(1)} kW</text>

        {/* Solar */}
        <rect x="460" y="40" width="80" height="80" fill="#EBCB8B" stroke="white" strokeWidth="2" rx="5"/>
        <text x="500" y="80" textAnchor="middle" dominantBaseline="middle" fill="#2E3440" fontWeight="bold" fontSize="12">SOLAR</text>
        <text x="500" y="135" textAnchor="middle" fill="white" fontSize="12">{sim.powerLabels.solar.toFixed(1)} kW</text>

        {/* House */}
        <rect x="760" y="210" width="80" height="80" fill="#88C0D0" stroke="white" strokeWidth="2" rx="5"/>
        <text x="800" y="250" textAnchor="middle" dominantBaseline="middle" fill="#2E3440" fontWeight="bold" fontSize="12">HOUSE</text>
        <text x="800" y="305" textAnchor="middle" fill="white" fontSize="12">{sim.powerLabels.house.toFixed(1)} kW</text>

        {/* EV */}
        <circle cx="500" cy="400" r="40" fill="#A3BE8C" 
          stroke={!sim.isEvPluggedIn ? "grey" : (Math.abs(sim.powerLabels.ev) > 0.1 ? "gold" : "white")} 
          strokeWidth={!sim.isEvPluggedIn ? 2 : (Math.abs(sim.powerLabels.ev) > 0.1 ? 4 : 2)} 
        />
        <text x="500" y="400" textAnchor="middle" dominantBaseline="middle" fill="#2E3440" fontWeight="bold" fontSize="12">EV</text>
        <text x="500" y="455" textAnchor="middle" fill="white" fontSize="12">{Math.abs(sim.powerLabels.ev).toFixed(1)} kW</text>
        <text x="500" y="345" textAnchor="middle" fill="white" fontSize="12">SOC: {sim.evSoc.toFixed(1)}%</text>

        {/* Battery */}
        <rect x="760" y="360" width="80" height="80" fill="#5E81AC" stroke="white" strokeWidth="2" rx="5"/>
        <text x="800" y="400" textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="bold" fontSize="11">HOME BATT</text>
        <text x="800" y="455" textAnchor="middle" fill="white" fontSize="12">{Math.abs(sim.powerLabels.battery).toFixed(1)} kW</text>
        <text x="800" y="345" textAnchor="middle" fill="white" fontSize="12">SOC: {sim.homeBatterySoc.toFixed(1)}%</text>

        {/* Flow Lines */}
        <FlowLine start={[240, 250]} end={[760, 250]} active={sim.flows.grid_house > 0} color="#e60000" />
        <FlowLine start={[230, 275]} end={[470, 375]} active={sim.flows.grid_ev > 0} color="#e60000" />
        <FlowLine start={[470, 375]} end={[230, 275]} active={sim.flows.ev_grid > 0} color="lightgreen" />
        
        <FlowLine start={[540, 80]} end={[780, 210]} active={sim.flows.solar_house > 0} color="gold" />
        <FlowLine start={[500, 120]} end={[500, 360]} active={sim.flows.solar_ev > 0} color="gold" />
        <FlowLine start={[520, 120]} end={[760, 360]} active={sim.flows.solar_battery > 0} color="gold" />

        <FlowLine start={[540, 400]} end={[760, 270]} active={sim.flows.ev_house > 0} color="lightblue" />
        <FlowLine start={[800, 360]} end={[800, 290]} active={sim.flows.battery_house > 0} color="cyan" />
      </svg>
    </div>
  );
}

function FlowLine({ start, end, active, color }: { start: [number, number], end: [number, number], active: boolean, color: string }) {
  if (!active) return null;
  return (
    <line 
      x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} 
      stroke={color} strokeWidth="3" strokeDasharray="6 6"
      className="animate-flow"
    />
  );
}
