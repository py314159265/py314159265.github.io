/* Mission catalog for the 3D atlas.
 * Tracks in data/probes.json are JPL Horizons ecliptic vectors.
 * Entries with `fixed` or `body` have no usable Horizons track and are documented here.
 */

export const ELEMENTS = {
  Mercury: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749], L: [252.25032350, 149472.67411175], w: [77.45779628, 0.16047689], O: [48.33076593, -0.12534081] },
  Venus:   { a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], I: [3.39467605, -0.00078890], L: [181.97909950, 58517.81538729], w: [131.60246718, 0.00268329], O: [76.67984255, -0.27769418] },
  Earth:   { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], w: [102.93768193, 0.32327364], O: [0, 0] },
  Mars:    { a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], w: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343] },
  Jupiter: { a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], w: [14.72847983, 0.21252668], O: [100.47390909, 0.20469106] },
  Saturn:  { a: [9.53667594, -0.00125060], e: [0.05415060, -0.00036762], I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], w: [92.59887831, -0.41897216], O: [113.66242448, -0.28867794] },
  Uranus:  { a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785], w: [170.95427630, 0.40805281], O: [74.01692503, 0.04240589] },
  Neptune: { a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], I: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325], w: [44.96476227, -0.32241464], O: [131.78422574, -0.00508664] },
  Pluto:   { a: [39.48211675, -0.00031596], e: [0.24882730, 0.00005170], I: [17.14001206, 0.00004818], L: [238.92903833, 145.20780515], w: [224.06891629, -0.04062942], O: [110.30393684, -0.01183482] },
};

export const PLANETS = [
  { name: "Mercury", color: 0xb8a78a, r: 0.42 },
  { name: "Venus", color: 0xd9c6a5, r: 0.58 },
  { name: "Earth", color: 0x6ea0d0, r: 0.64 },
  { name: "Mars", color: 0xc57a5a, r: 0.5 },
  { name: "Jupiter", color: 0xd4b07a, r: 1.15 },
  { name: "Saturn", color: 0xe0c992, r: 1.0, ring: true },
  { name: "Uranus", color: 0x8ec8c8, r: 0.78 },
  { name: "Neptune", color: 0x5b84c4, r: 0.76 },
  { name: "Pluto", color: 0xc4b4a0, r: 0.36 },
];

/* Visual offsets are in compressed world units, so a cluster can be told apart.
 * Rosetta and NEAR are not at a planet. Their fixed places are the approximate
 * heliocentric position of 67P and Eros at the end of each mission, not a Horizons sample.
 * Tianwen-1 has no public Horizons ephemeris after February 2021; it stays at Mars.
 */
export const CRAFT = [
  { id: "voyager1", name: "Voyager 1", agency: "NASA / JPL", rocket: "Titan IIIE-Centaur", launched: "1977-09-05", group: "active", sub: "The farthest of all.", fact: "It is the most distant human-made object. A 23-watt transmitter still answers Earth, the reply taking more than a day to come home.", trail: "outbound", major: true },
  { id: "voyager2", name: "Voyager 2", agency: "NASA / JPL", rocket: "Titan IIIE-Centaur", launched: "1977-08-20", group: "active", sub: "The only visit to Uranus and Neptune.", fact: "A grand tour that actually happened: Jupiter, Saturn, Uranus, and Neptune, and then out of the Sun’s bubble.", trail: "outbound", major: true },
  { id: "newHorizons", name: "New Horizons", agency: "NASA", rocket: "Atlas V 551", launched: "2006-01-19", group: "active", sub: "Pluto, then onward.", fact: "It crossed the Pluto system in July 2015 and later flew past Arrokoth, a Kuiper belt world barely 36 kilometers across.", trail: "outbound", major: true },
  { id: "parker", name: "Parker Solar Probe", label: "Parker", agency: "NASA", rocket: "Delta IV Heavy", launched: "2018-08-12", group: "active", sub: "Touching the corona.", fact: "It dives closer to the Sun than any spacecraft before it, flying through the corona and coming out the other side.", trail: "recent", recentDays: 70, color: 0xe3a283, major: true },
  { id: "solarOrbiter", name: "Solar Orbiter", agency: "ESA / NASA", rocket: "Atlas V", launched: "2020-02-10", group: "active", sub: "Looking at the Sun’s poles.", fact: "It climbs out of the ecliptic for a high look at the solar poles, and photographs the Sun from closer than Earth ever gets.", trail: "recent", recentDays: 80 },
  { id: "bepiColombo", name: "BepiColombo", agency: "ESA / JAXA", rocket: "Ariane 5", launched: "2018-10-20", group: "active", sub: "On the long road to Mercury.", fact: "Two orbiters share the cruise, using flybys of Earth, Venus, and Mercury to fall into orbit around the innermost planet.", trail: "recent", recentDays: 100 },
  { id: "juno", name: "Juno", agency: "NASA", rocket: "Atlas V 551", launched: "2011-08-05", group: "active", sub: "Circling Jupiter.", fact: "A solar-powered orbiter mapping Jupiter’s gravity, magnetic field, and the roots of the Great Red Spot.", trail: "none", major: true },
  { id: "europaClipper", name: "Europa Clipper", agency: "NASA", rocket: "Falcon Heavy", launched: "2024-10-14", group: "active", sub: "Bound for Europa.", fact: "It will loop past Jupiter’s ocean moon dozens of times, looking for a habitable sea under the ice.", trail: "recent", recentDays: 90, major: true },
  { id: "juice", name: "JUICE", agency: "ESA", rocket: "Ariane 5", launched: "2023-04-14", group: "active", sub: "Toward Jupiter’s icy moons.", fact: "Jupiter Icy Moons Explorer is cruising out to orbit Ganymede, after flybys of Europa and Callisto.", trail: "recent", recentDays: 100, major: true },
  { id: "lucy", name: "Lucy", agency: "NASA", rocket: "Atlas V", launched: "2021-10-16", group: "active", sub: "Touring the Trojan asteroids.", fact: "Named for the fossil, it is on a tour of the asteroids that share Jupiter’s orbit, relics of the early solar system.", trail: "recent", recentDays: 100, major: true },
  { id: "psyche", name: "Psyche", agency: "NASA", rocket: "Falcon Heavy", launched: "2023-10-13", group: "active", sub: "Bound for a metal world.", fact: "It is headed for the asteroid Psyche, thought to be the exposed core of a shattered planetesimal.", trail: "recent", recentDays: 90, major: true },
  { id: "osirisApex", name: "OSIRIS-APEX", agency: "NASA", rocket: "Atlas V", launched: "2016-09-08", group: "active", sub: "From Bennu on to Apophis.", fact: "The same spacecraft that returned a sample of Bennu is now OSIRIS-APEX, retargeted to the asteroid Apophis.", trail: "recent", recentDays: 120 },
  { id: "hera", name: "Hera", agency: "ESA", rocket: "Falcon 9", launched: "2024-10-07", group: "active", sub: "Inspecting a redirected asteroid.", fact: "It is flying out to Didymos to survey the crater DART left on the little moon Dimorphos.", trail: "recent", recentDays: 80 },
  { id: "hayabusa2", name: "Hayabusa2", agency: "JAXA", rocket: "H-IIA", launched: "2014-12-03", group: "active", sub: "Onward to 1998 KY26.", fact: "After returning pieces of Ryugu to Earth in 2020, it set off toward the tiny asteroid 1998 KY26.", trail: "recent", recentDays: 80 },
  { id: "starman", name: "Starman", agency: "SpaceX", rocket: "Falcon Heavy", launched: "2018-02-06", group: "active", sub: "A car between Earth and Mars.", fact: "The dummy in the driver’s seat is still on the first Falcon Heavy payload: a Roadster in a long solar orbit.", trail: "recent", recentDays: 60 },
  { id: "jwst", name: "James Webb", agency: "NASA / ESA / CSA", rocket: "Ariane 5", launched: "2021-12-25", group: "active", sub: "A cold eye at L2.", fact: "It keeps station around the Sun–Earth L2 point, about a million miles from Earth, with its sunshield facing the inner solar system.", trail: "none", earth: true },
  { id: "gaia", name: "Gaia", agency: "ESA", rocket: "Soyuz", launched: "2013-12-19", group: "active", sub: "Mapping the Milky Way from L2.", fact: "From the Sun–Earth L2 point it has measured the positions and motions of nearly two billion stars.", trail: "none", earth: true },
  { id: "euclid", name: "Euclid", agency: "ESA", rocket: "Falcon 9", launched: "2023-07-01", group: "active", sub: "Surveying the dark universe from L2.", fact: "It shares the Sun–Earth L2 neighborhood, mapping galaxies to study dark matter and dark energy.", trail: "none", earth: true },
  { id: "perseverance", name: "Perseverance", agency: "NASA", rocket: "Atlas V", launched: "2020-07-30", group: "active", sub: "A rover in Jezero crater.", fact: "It is caching samples of an ancient Martian lakebed for a later return to Earth.", trail: "none", cluster: "mars" },
  { id: "curiosity", name: "Curiosity", agency: "NASA", rocket: "Atlas V", launched: "2011-11-26", group: "active", sub: "Still climbing Gale crater.", fact: "The rover has been driving Mount Sharp since 2012, reading the layers of a long-dry lake.", trail: "none", cluster: "mars" },
  { id: "maven", name: "MAVEN", agency: "NASA", rocket: "Atlas V", launched: "2013-11-18", group: "active", sub: "Watching Mars lose its air.", fact: "It orbits Mars to measure how the solar wind strips the upper atmosphere.", trail: "none", cluster: "mars" },
  { id: "marsExpress", name: "Mars Express", agency: "ESA", rocket: "Soyuz", launched: "2003-06-02", group: "active", sub: "ESA’s long-lived Mars orbiter.", fact: "In orbit since 2003, it has mapped the planet and listened for the fate of its companion lander, Beagle 2.", trail: "none", cluster: "mars" },
  { id: "tianwen1", name: "Tianwen-1", agency: "CNSA", rocket: "Long March 5", launched: "2020-07-23", group: "active", sub: "China’s orbiter at Mars.", fact: "The orbiter delivered the Zhurong rover and is still circling Mars. Horizons has no public ephemeris for it after February 2021, so it is held at Mars.", trail: "none", cluster: "mars", fixed: true },
  { id: "hope", name: "Hope", agency: "UAESA", rocket: "H-IIA", launched: "2020-07-19", group: "active", sub: "The Emirates Mars Mission.", fact: "It studies the Martian atmosphere and weather through a full day, from a high wide orbit.", trail: "none", cluster: "mars" },

  { id: "pioneer10", name: "Pioneer 10", agency: "NASA", rocket: "Atlas-Centaur", launched: "1972-03-03", group: "inactive", sub: "The first to the outer planets.", fact: "First to cross the asteroid belt and fly by Jupiter. The last signal was heard in 2003; it is still coasting out.", trail: "outbound", inactive: true, major: true },
  { id: "pioneer11", name: "Pioneer 11", agency: "NASA", rocket: "Atlas-Centaur", launched: "1973-04-06", group: "inactive", sub: "First to Saturn.", fact: "It flew past Jupiter and then Saturn, and fell silent in 1995 on its way out of the system.", trail: "outbound", inactive: true, major: true },

  { id: "cassini", name: "Cassini", agency: "NASA / ESA / ASI", rocket: "Titan IVB-Centaur", launched: "1997-10-15", arrived: "2004-07-01", ended: "2017-09-15", fate: "Entered Saturn’s atmosphere", group: "ended", sub: "Thirteen years at Saturn.", fact: "After 13 years in orbit it dove between the rings and the cloud tops, then burned up so it could never contaminate Enceladus or Titan.", body: "Saturn", offset: [1.1, 0.9, 0.4] },
  { id: "huygens", name: "Huygens", agency: "ESA / NASA", rocket: "Titan IVB-Centaur", launched: "1997-10-15", arrived: "2005-01-14", ended: "2005-01-14", fate: "Landed on Titan", group: "ended", sub: "A landing on Titan.", fact: "It rode with Cassini and then descended through Titan’s haze, the farthest landing from Earth.", body: "Saturn", offset: [2.4, 0.35, 1.6] },
  { id: "galileo", name: "Galileo", agency: "NASA", rocket: "Space Shuttle Atlantis", launched: "1989-10-18", arrived: "1995-12-07", ended: "2003-09-21", fate: "Entered Jupiter’s atmosphere", group: "ended", sub: "First to orbit Jupiter.", fact: "It toured the Jovian moons for eight years, then was sent into Jupiter so it would not hit Europa.", body: "Jupiter", offset: [-1.6, -0.5, 0.8] },
  { id: "messenger", name: "MESSENGER", agency: "NASA", rocket: "Delta II", launched: "2004-08-03", arrived: "2011-03-18", ended: "2015-04-30", fate: "Impacted Mercury", group: "ended", sub: "First to orbit Mercury.", fact: "After mapping Mercury it ran out of fuel and struck the surface, as planned.", body: "Mercury", offset: [0.7, 0.35, 0.4] },
  { id: "magellan", name: "Magellan", agency: "NASA", rocket: "Space Shuttle Atlantis", launched: "1989-05-04", arrived: "1990-08-10", ended: "1994-10-13", fate: "Entered Venus’s atmosphere", group: "ended", sub: "Radar maps of Venus.", fact: "Its radar saw through the clouds. At the end it was lowered into the atmosphere.", body: "Venus", offset: [0.9, 0.45, 0.3] },
  { id: "venera", name: "Venera", agency: "USSR", rocket: "Proton", launched: "1961-02-12", arrived: "1967-10-18", ended: "1983-03-01", fate: "Landed on Venus", group: "ended", sub: "Landers on Venus.", fact: "Several Venera landers reached the surface and sent back pictures from under the clouds before the heat took them.", body: "Venus", offset: [-0.7, 0.2, 0.7] },
  { id: "rosetta", name: "Rosetta / Philae", agency: "ESA", rocket: "Ariane 5", launched: "2004-03-02", arrived: "2014-08-06", ended: "2016-09-30", fate: "Landed on comet 67P", group: "ended", sub: "A comet, up close.", fact: "Rosetta orbited comet 67P and set the lander Philae on it, then itself came to rest on the nucleus.", fixedAu: 3.6, fixedLon: 48, fixedLat: 7 },
  { id: "near", name: "NEAR Shoemaker", agency: "NASA", rocket: "Delta II", launched: "1996-02-17", arrived: "2000-02-14", ended: "2001-02-12", fate: "Landed on Eros", group: "ended", sub: "First to land on an asteroid.", fact: "It orbited the asteroid Eros and then set down on the surface, the first soft landing on an asteroid.", fixedAu: 1.46, fixedLon: 128, fixedLat: 6 },
  { id: "viking", name: "Viking", agency: "NASA", rocket: "Titan IIIE", launched: "1975-08-20", arrived: "1976-07-20", ended: "1982-11-13", fate: "At rest on Mars", group: "ended", sub: "The first long look from the surface.", fact: "Two orbiters and two landers. Viking 1’s lander kept sending until 1982.", body: "Mars", offset: [0.9, 0.45, 0.2], cluster: "mars" },
  { id: "spirit", name: "Spirit", agency: "NASA", rocket: "Delta II", launched: "2003-06-10", arrived: "2004-01-04", ended: "2010-03-22", fate: "At rest on Mars", group: "ended", sub: "A rover in Gusev crater.", fact: "It drove farther than planned, then fell silent in a sand trap in 2010.", body: "Mars", offset: [0.2, 0.85, 0.7], cluster: "mars" },
  { id: "opportunity", name: "Opportunity", agency: "NASA", rocket: "Delta II", launched: "2003-07-07", arrived: "2004-01-25", ended: "2019-02-13", fate: "At rest on Mars", group: "ended", sub: "Fourteen years on Meridiani.", fact: "Built for 90 days, it explored Mars until a global dust storm ended the mission in 2018.", body: "Mars", offset: [-0.85, 0.25, 0.65], cluster: "mars" },
  { id: "apollo", name: "Apollo landings", agency: "NASA", rocket: "Saturn V", launched: "1969-07-16", arrived: "1969-07-20", ended: "1972-12-19", fate: "At rest on the Moon", group: "ended", sub: "Six landings on the Moon.", fact: "Apollos 11 through 17, except 13, left footprints, instruments, and descent stages on the lunar surface.", earth: true },

  { id: "roman", name: "Nancy Grace Roman", agency: "NASA", rocket: "Falcon Heavy", launched: "2027-05-01", group: "planned", sub: "Planned for about 2027.", fact: "A wide-field infrared telescope meant to share the Sun–Earth L2 neighborhood with Webb. It has not launched yet.", planned: true, earth: true },
];

export const GROUPS = [
  { id: "active", title: "Active" },
  { id: "inactive", title: "Inactive" },
  { id: "ended", title: "Ended or at rest" },
  { id: "planned", title: "Planned" },
];
