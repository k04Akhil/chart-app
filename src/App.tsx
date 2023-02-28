import { lightningChart } from '@arction/lcjs'
import { useEffect, useRef } from 'react'
import './App.css'

function App(props: any) {
  // For testing with random data
  // const [data, setData]:any = useState([]);

  // useEffect(() => {
  //   const interval1 = setInterval(() => {
  //     setData([
  //       { x: 0, y: Math.random() * 100 },
  //       { x: 1, y: Math.random() * 100 },
  //       { x: 2, y: Math.random() * 100 },
  //       { x: 3, y: Math.random() * 100 },
  //       { x: 4, y: Math.random() * 100 },
  //     ]);
  //   }, 3000);

  //   return () => {
  //     clearInterval(interval1);
  //   };
  // }, []);

  const { data, id, className } = props
  const chartRef: any = useRef(undefined)

  useEffect(() => {
    // Create chart, series and any other static components.
    // NOTE: console log is used to make sure that chart is only created once, even if data is changed!
    console.log('create chart')
    const chart = lightningChart().ChartXY({ container: id })
    const series = chart.addLineSeries()
    // Store references to chart components.
    chartRef.current = { chart, series }

    // Return function that will destroy the chart when component is unmounted.
    return () => {
      // Destroy chart.
      console.log('destroy chart')
      chart.dispose()
      chartRef.current = undefined
    }
  }, [id])

  useEffect(() => {
    const components = chartRef.current
    if (!components) return

    // Set chart data.
    const { series } = components
    console.log('set chart data', data)
    series.clear().add(data)

  }, [data, chartRef])

  return (
    <div className="fill">
      <div id={id} className={`chart ${className}`}></div>
    </div>
  )
}

export default App
