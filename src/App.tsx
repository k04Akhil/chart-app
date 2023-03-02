import { AutoCursorModes, AxisTickStrategies, ColorHEX, ColorRGBA, emptyFill, emptyLine, lightningChart, Point, PointShape, SolidFill } from '@arction/lcjs';
import { useEffect, useRef } from 'react';
import './App.css';
import useDataGenerator from './useDataGenerator';

function App(props: any) {

  const { data, id, className } = props

  const X_VIEW_MS = 14 * 1000;
  const info = {
    name: "ECG",
    color: ColorHEX("#00ff00"),
    backgroundColor: ColorRGBA(31, 33, 66),
    yMin: -2500,
    yMax: 2500,
  };
  const chartRef: any = useRef(undefined);
  const bufferedIncomingPoints = useRef<Point[]>([]);
  const pointCache = useRef<Point[]>([]);
  const prevPosX = useRef<number>(0);
  const forwardBufferedIncomingPointsHandle = useRef<any>();

  useEffect(() => {
    // Create chart, series and any other static components.
    // NOTE: console log is used to make sure that chart is only created once, even if data is changed!
    console.log('Chart created');
    const chart = lightningChart().ChartXY({ container: id })
    const series = createChartConfig(chart)

    // Store references to chart components.
    chartRef.current = { chart, series }

    // Return function that will destroy the chart when component is unmounted.
    return () => {
      // Destroy chart.
      console.log('destroy chart')
      chart.dispose()
      chartRef.current = undefined

      if (forwardBufferedIncomingPointsHandle.current !== undefined)
        cancelAnimationFrame(forwardBufferedIncomingPointsHandle.current);
    }
  }, [id])

  useEffect(() => {
    const components = chartRef.current

    if (!components || (data && data.length === 0)) return

    for (const point of data) {
      bufferedIncomingPoints.current.push(point);
    }

    forwardBufferedIncomingPointsHandle.current =
      forwardBufferedIncomingPointsHandle.current ||
      requestAnimationFrame(forwardBufferedIncomingPoints);

  }, [data, chartRef])


  function createChartConfig(chart: any) {

    if (!chart) return;

    chart
      .setTitle(info.name)
      .setAutoCursorMode(AutoCursorModes.disabled)
      .setBackgroundFillStyle(new SolidFill({ color: info.backgroundColor }))
      .setBackgroundStrokeStyle(emptyLine)
      .setSeriesBackgroundFillStyle(emptyFill)
      .setSeriesBackgroundStrokeStyle(emptyLine)
      .setMouseInteractions(false)

    const axisX = chart
      .getDefaultAxisX()
      .setTickStrategy(AxisTickStrategies.Empty)
      .setStrokeStyle(emptyLine)
      .setScrollStrategy(undefined)
      .setInterval({ start: 0, end: X_VIEW_MS, stopAxisAfter: false })


    const axisY = chart
      .getDefaultAxisY()
      .setStrokeStyle(emptyLine)
      .setInterval({ start: info.yMin, end: info.yMax })
      .setTickStrategy(AxisTickStrategies.Empty);

    // Series for displaying "old" data.
    const seriesRight = chart
      .addLineSeries({
        dataPattern: { pattern: 'ProgressiveX' },
        automaticColorIndex: 0,
      })
      .setName(info.name)
      .setStrokeStyle((stroke: any) => stroke.setThickness(2))
      .setEffect(false)

    // Rectangle for hiding "old" data under incoming "new" data.
    const seriesOverlayRight = chart
      .addRectangleSeries()
      .setEffect(false)
      .add({ x1: 0, y1: 0, x2: 0, y2: 0 })
      .setFillStyle(new SolidFill({ color: info.backgroundColor }))
      .setStrokeStyle(emptyLine)
      .setMouseInteractions(false)

    // Series for displaying new data.
    const seriesLeft = chart
      .addLineSeries({
        dataPattern: { pattern: 'ProgressiveX' },
        automaticColorIndex: 0,
      })
      .setName(info.name)
      .setStrokeStyle((stroke: any) => stroke.setThickness(2))
      .setEffect(false)

    const seriesHighlightLastPoints = chart
      .addPointSeries({ pointShape: PointShape.Circle })
      .setPointFillStyle(new SolidFill({ color: ColorHEX("#ffffff") }))
      .setPointSize(5)
      .setEffect(false)

    // Synchronize highlighting of "left" and "right" series.
    let isHighlightChanging = false
      ;[seriesLeft, seriesRight].forEach((series) => {
        series.onHighlight((value: any) => {
          if (isHighlightChanging) {
            return
          }
          isHighlightChanging = true
          seriesLeft.setHighlight(value)
          seriesRight.setHighlight(value)
          isHighlightChanging = false
        })
      })

    return {
      ...chart,
      seriesLeft,
      seriesRight,
      seriesOverlayRight,
      seriesHighlightLastPoints,
      axisX,
      axisY,
    };
  }

  function forwardBufferedIncomingPoints() {
    const components = chartRef.current
    if (!components) return

    const { series } = components

    // Keep track of the latest X (time position), clamped to the sweeping axis range.
    let posX = 0;

    const newDataPointsTimestamped = bufferedIncomingPoints.current;
    const newDataCache = pointCache.current;

    if (newDataPointsTimestamped.length === 0) return

    // NOTE: Incoming data points are timestamped, meaning their X coordinates can go outside sweeping axis interval.
    // Clamp timestamps onto the sweeping axis range.
    const newDataPointsSweeping = newDataPointsTimestamped.map((dp) => ({
      x: dp.x % X_VIEW_MS,
      y: dp.y,
    }));

    posX = Math.max(
      posX,
      newDataPointsSweeping[newDataPointsSweeping.length - 1].x
    );

    // Check if the channel completes a full sweep (or even more than 1 sweep even though it can't be displayed).
    let fullSweepsCount = 0;
    let signPrev = false;
    for (const dp of newDataPointsSweeping) {
      const sign = dp.x < prevPosX.current;
      if (sign === true && sign !== signPrev) {
        fullSweepsCount += 1;
      }
      signPrev = sign;
    }

    if (fullSweepsCount > 1) {
      // The below algorithm is incapable of handling data input that spans over several full sweeps worth of data.
      // To prevent visual errors, reset sweeping graph and do not process the data.
      // This scenario is triggered when switching tabs or minimizing the example for extended periods of time.
      series.seriesRight.clear();
      series.seriesLeft.clear();
      newDataCache.length = 0;
    } else if (fullSweepsCount === 1) {
      // Sweeping cycle is completed.
      // Copy data of "left" series into the "right" series, clear "left" series.

      // Categorize new data points into "right" and "left" sides.
      const newDataPointsLeft: Point[] = [];
      for (const dp of newDataPointsSweeping) {
        if (dp.x > prevPosX.current) {
          newDataCache.push(dp);
        } else {
          newDataPointsLeft.push(dp);
        }
      }
      series.seriesRight.clear().add(newDataCache);
      series.seriesLeft.clear().add(newDataPointsLeft);
      newDataCache.length = 0;
      newDataCache.push(...newDataPointsLeft);
    } else {
      // Append data to left.
      series.seriesLeft.add(newDataPointsSweeping);
      // NOTE: While extremely performant, this syntax can crash if called with extremely large arrays (at least 100 000 items).
      newDataCache.push(...newDataPointsSweeping);
    }

    // Highlight last data point.
    const highlightPoints = [
      newDataCache.length > 0
        ? newDataCache[newDataCache.length - 1]
        : newDataPointsSweeping[newDataPointsSweeping.length - 1],
    ];
    series.seriesHighlightLastPoints.clear().add(highlightPoints);

    // Move overlays of old data to right locations.
    const overlayXStart = 0;
    const overlayXEnd = posX + X_VIEW_MS * 0.03;
    series.seriesOverlayRight.setDimensions({
      x1: overlayXStart,
      x2: overlayXEnd,
      y1: series.axisY.getInterval().start,
      y2: series.axisY.getInterval().end,
    });

    prevPosX.current = posX;
    forwardBufferedIncomingPointsHandle.current = undefined;
    bufferedIncomingPoints.current.length = 0;
  }

  return (
      <div id={id} className={`chart ${className}`}></div>
  )
}

export default App
