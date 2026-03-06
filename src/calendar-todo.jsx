import { useState, useRef, useEffect, useCallback } from "react";

const DAYS_LABEL = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const CATEGORIES = [
  { id:"work",    label:"Work",    emoji:"💼", color:"#3B82F6", light:"#1E3A5F", dot:"#60A5FA" },
  { id:"study",   label:"Study",   emoji:"📚", color:"#8B5CF6", light:"#2E1B5E", dot:"#A78BFA" },
  { id:"crochet", label:"Crochet", emoji:"🧶", color:"#EC4899", light:"#4A1535", dot:"#F472B6" },
  { id:"life",    label:"Life",    emoji:"🌿", color:"#10B981", light:"#0A3728", dot:"#34D399" },
  { id:"health",  label:"Health",  emoji:"🏃", color:"#F59E0B", light:"#3D2700", dot:"#FCD34D" },
  { id:"social",  label:"Social",  emoji:"✨", color:"#EF4444", light:"#3D0A0A", dot:"#FCA5A5" },
];

function getCat(id){ return CATEGORIES.find(c=>c.id===id)||CATEGORIES[3]; }
function getDaysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
function getFirstDay(y,m){ return new Date(y,m,1).getDay(); }
function toDateStr(date){ return date.toISOString().split("T")[0]; }
function fmtDate(str){
  if(!str) return "";
  const [,m,d]=str.split("-");
  return `${MONTHS_SHORT[Number(m)-1]} ${Number(d)}`;
}
function daysUntilDDL(ddlStr){
  if(!ddlStr) return null;
  const today=new Date(); today.setHours(0,0,0,0);
  const ddl=new Date(ddlStr); ddl.setHours(0,0,0,0);
  return Math.round((ddl-today)/(1000*60*60*24));
}
function getUrgency(ddlStr){
  const d=daysUntilDDL(ddlStr);
  if(d===null) return null;
  if(d<0)   return {stars:5,label:"Overdue!",color:"#EF4444",overdue:true};
  if(d===0) return {stars:5,label:"Due today",color:"#EF4444"};
  if(d<=1)  return {stars:4,label:"Due tomorrow",color:"#F97316"};
  if(d<=3)  return {stars:3,label:`${d} days left`,color:"#F59E0B"};
  if(d<=5)  return {stars:2,label:`${d} days left`,color:"#EAB308"};
  if(d<=7)  return {stars:1,label:`${d} days left`,color:"#84CC16"};
  return {stars:0,label:`${d} days left`,color:"#555"};
}
function Stars({urgency}){
  if(!urgency||urgency.stars===0) return null;
  return(
    <span style={{color:urgency.color,fontSize:11,letterSpacing:"-1px",lineHeight:1}}>
      {"★".repeat(urgency.stars)}{"☆".repeat(5-urgency.stars)}
    </span>
  );
}

export default function App(){
  const today=new Date();
  const todayStr=toDateStr(today);
  const [year,setYear]=useState(today.getFullYear());
  const [month,setMonth]=useState(today.getMonth());
  const [tasks,setTasks]=useState(()=>{
    try{ return JSON.parse(localStorage.getItem("chronicle_tasks")||"{}"); }
    catch{ return {}; }
  });
  const [editingTask, setEditingTask] = useState(null);
  useEffect(()=>{
    localStorage.setItem("chronicle_tasks", JSON.stringify(tasks));
  },[tasks]);
  const [selectedDay,setSelectedDay]=useState(null);
  const [showModal,setShowModal]=useState(false);
  const [view,setView]=useState("calendar");
  const [filterCat,setFilterCat]=useState("all");
  const [expandedTask,setExpandedTask]=useState(null);
  const [newText,setNewText]=useState("");
  const [newCat,setNewCat]=useState("work");
  const [newStart,setNewStart]=useState(todayStr);
  const [newDDL,setNewDDL]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [isFullscreen,setIsFullscreen]=useState(false);
  const inputRef=useRef(null);
  const appRef=useRef(null);

  useEffect(()=>{
    const handler=()=>setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange",handler);
    return()=>document.removeEventListener("fullscreenchange",handler);
  },[]);

  function toggleFullscreen(){
    if(!document.fullscreenElement){
      appRef.current?.requestFullscreen().catch(()=>{});
    } else {
      document.exitFullscreen().catch(()=>{});
    }
  }

  const daysInMonth=getDaysInMonth(year,month);
  const firstDay=getFirstDay(year,month);
  const dayKey=selectedDay?`${year}-${month}-${selectedDay}`:null;
  const dayTasks=dayKey?(tasks[dayKey]||[]):[];

  function prevMonth(){ if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); }
  function nextMonth(){ if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); }

  function openDay(day){
    setSelectedDay(day);
    setShowModal(true);
    setNewText(""); setNewDDL("");
    setNewStart(`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`);
    setTimeout(()=>inputRef.current?.focus(),120);
  }

  async function addTask(){
    if(!newText.trim()||aiLoading) return;
    const key=`${year}-${month}-${selectedDay}`;
    const taskId=Date.now();
    const cat=getCat(newCat);
    const skeleton={id:taskId,text:newText.trim(),catId:newCat,startDate:newStart,ddl:newDDL,steps:[],loading:true};
    setTasks(prev=>({...prev,[key]:[...(prev[key]||[]),skeleton]}));
    setNewText(""); setAiLoading(true);
    try{
      const res = await fetch("https://calendendar.lavender030319.workers.dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Break down this to-do task into 3-6 concrete, actionable steps. Return ONLY a JSON array with no markdown or explanation. Format: [{"step":"Short title (max 6 words)","detail":"One sentence description"}]\n\nCategory: ${cat.label}\n${newStart?"Start: "+fmtDate(newStart):""}\n${newDDL?"Deadline: "+fmtDate(newDDL):""}\nTask: "${newText.trim()}"` }]
          }]
        }),
      });
      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      const steps = JSON.parse(raw.replace(/```json|```/g,"").trim()).map((s,i)=>({...s,done:false,id:i}));
      setTasks(prev=>({...prev,[key]:(prev[key]||[]).map(t=>t.id===taskId?{...t,steps,loading:false}:t)}));
    }catch{
      setTasks(prev=>({...prev,[key]:(prev[key]||[]).map(t=>t.id===taskId?{...t,steps:[{id:0,step:"Complete task",detail:newText.trim(),done:false}],loading:false}:t)}));
    }
    setAiLoading(false);
  }

  function toggleStep(key,taskId,stepId){
    setTasks(prev=>({...prev,[key]:prev[key].map(t=>t.id===taskId?{...t,steps:t.steps.map(s=>s.id===stepId?{...s,done:!s.done}:s)}:t)}));
  }
  function deleteTask(key,taskId){
    setTasks(prev=>({...prev,[key]:(prev[key]||[]).filter(t=>t.id!==taskId)}));
  }
  function updateTaskText(key, taskId, newText){
    if(!newText.trim()) return;
    setTasks(prev=>({...prev,[key]:prev[key].map(t=>t.id===taskId?{...t,text:newText.trim()}:t)}));
    setEditingTask(null);
  }

  const allTasks=Object.entries(tasks).flatMap(([k,ts])=>ts.map(t=>({...t,key:k})));
  const filteredTasks=filterCat==="all"?allTasks:allTasks.filter(t=>t.catId===filterCat);
  const totalSteps=allTasks.reduce((a,t)=>a+t.steps.length,0);
  const doneSteps=allTasks.reduce((a,t)=>a+t.steps.filter(s=>s.done).length,0);
  const overallPct=totalSteps===0?0:Math.round((doneSteps/totalSteps)*100);
  const catStats=CATEGORIES.map(cat=>{
    const ts=allTasks.filter(t=>t.catId===cat.id);
    const tot=ts.reduce((a,t)=>a+t.steps.length,0);
    const dn=ts.reduce((a,t)=>a+t.steps.filter(s=>s.done).length,0);
    return{...cat,count:ts.length,total:tot,done:dn,pct:tot===0?0:Math.round((dn/tot)*100)};
  });
  const urgentTasks=allTasks
    .filter(t=>{const u=getUrgency(t.ddl);return u&&u.stars>0;})
    .sort((a,b)=>(daysUntilDDL(a.ddl)||999)-(daysUntilDDL(b.ddl)||999));

  function getDayTs(day){ return tasks[`${year}-${month}-${day}`]||[]; }
  function getDayPct(day){
    const ts=getDayTs(day);
    const tot=ts.reduce((a,t)=>a+t.steps.length,0);
    const dn=ts.reduce((a,t)=>a+t.steps.filter(s=>s.done).length,0);
    return tot===0?0:Math.round((dn/tot)*100);
  }
  function getDayMaxUrg(day){
    let max=0;
    getDayTs(day).forEach(t=>{const u=getUrgency(t.ddl);if(u&&u.stars>max)max=u.stars;});
    return max;
  }
  const urgColor=(n)=>n>=5?"#EF4444":n>=4?"#F97316":n>=3?"#F59E0B":n>=2?"#EAB308":"#84CC16";
  const isToday=(d)=>d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
  const nb={background:"#e3cae0",border:"1px solidrgb(14, 14, 64)",color:"#AAA",width:36,height:36,borderRadius:9,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"};
  const previewUrg=newDDL?getUrgency(newDDL):null;

  return(
    <div ref={appRef} style={{minHeight:"100vh",background:"#d1bac6",fontFamily:"'Georgia',serif",color:"#EDE8E0"}}>

      {/* HEADER */}
      <div style={{background:"##ccc0cc",borderBottom:"1px solid #1E1E30",padding:"13px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:29,height:29,borderRadius:"50%",background:"linear-gradient(135deg,#8B5CF6,#EC4899)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>◈</div>
          <span style={{fontSize:17,fontWeight:700,letterSpacing:"0.06em"}}>Chronicle</span>
          {urgentTasks.length>0&&(
            <div style={{background:"#3D0A0A",border:"1px solid #EF444455",borderRadius:20,padding:"2px 8px",fontSize:10,color:"#FCA5A5",display:"flex",alignItems:"center",gap:3}}>
              ★ {urgentTasks.length} urgent
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:3,background:"#b3a1c4",borderRadius:9,padding:3,border:"1px solid #222234"}}>
          {[["calendar","Calendar"],["urgent","Urgent"],["progress","Progress"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{padding:"5px 13px",borderRadius:6,border:"none",cursor:"pointer",background:view===v?"linear-gradient(135deg,#8B5CF6,#EC4899)":"transparent",color:view===v?"#fff":"#666",fontSize:11,fontFamily:"inherit",fontWeight:600}}>{l}</button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:11,color:"#555"}}>{overallPct}% done</div>
          <button onClick={toggleFullscreen} title={isFullscreen?"Exit fullscreen":"Enter fullscreen"} style={{background:"#1A1A28",border:"1px solid #222234",borderRadius:7,color:"#888",cursor:"pointer",width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>
            {isFullscreen?"⊡":"⤢"}
          </button>
        </div>
      </div>

      {/* LEGEND BAR */}
      <div style={{background:"#11111C",borderBottom:"1px solid #1A1A2A",padding:"8px 20px",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        {CATEGORIES.map(cat=>(
          <div key={cat.id} style={{display:"flex",alignItems:"center",gap:3,background:cat.light,borderRadius:20,padding:"2px 8px",border:`1px solid ${cat.color}44`,fontSize:10}}>
            <span>{cat.emoji}</span><span style={{color:cat.dot,fontWeight:600}}>{cat.label}</span>
          </div>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5,fontSize:10,flexWrap:"wrap"}}>
          {[["#84CC16","★","7d"],["#EAB308","★★","5d"],["#F59E0B","★★★","3d"],["#F97316","★★★★","1d"],["#EF4444","★★★★★","today"]].map(([c,s,l])=>(
            <span key={l} style={{color:c}}>{s}<span style={{color:"#444",fontSize:9}}> {l}</span></span>
          ))}
        </div>
      </div>

      {/* CALENDAR */}
      {view==="calendar"&&(
        <div style={{padding:"20px 16px",maxWidth:900,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <button onClick={prevMonth} style={nb}>‹</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:26,fontWeight:700}}>{MONTHS[month]}</div>
              <div style={{fontSize:12,color:"#555"}}>{year}</div>
            </div>
            <button onClick={nextMonth} style={nb}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,marginBottom:4}}>
            {DAYS_LABEL.map(d=><div key={d} style={{textAlign:"center",fontSize:10,color:"#444",padding:"2px 0"}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5}}>
            {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
            {Array.from({length:daysInMonth}).map((_,i)=>{
              const day=i+1;
              const ts=getDayTs(day);
              const pct=getDayPct(day);
              const maxUrg=getDayMaxUrg(day);
              const catIds=[...new Set(ts.map(t=>t.catId))];
              return(
                <div key={day} onClick={()=>openDay(day)} style={{minHeight:76,borderRadius:11,background:isToday(day)?"#ab98a2":"#705e6a",border:isToday(day)?"1.5px solid #8B5CF6":"1px solid #1E1E2C",cursor:"pointer",padding:"7px 6px 6px",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
                    <span style={{fontSize:13,fontWeight:isToday(day)?700:400,color:isToday(day)?"#3d2b3d":"#999"}}>{day}</span>
                    {maxUrg>0&&<span style={{fontSize:9,color:urgColor(maxUrg),letterSpacing:"-1.5px",lineHeight:1}}>{"★".repeat(maxUrg)}</span>}
                  </div>
                  {ts.length>0&&(
                    <div>
                      <div style={{display:"flex",gap:2,flexWrap:"wrap",marginBottom:3}}>
                        {catIds.map(cid=>{
                          const cat=getCat(cid);
                          const cnt=ts.filter(t=>t.catId===cid).length;
                          return <div key={cid} style={{display:"flex",alignItems:"center",gap:1,background:cat.light,borderRadius:4,padding:"1px 3px",fontSize:9}}><span>{cat.emoji}</span>{cnt>1&&<span style={{color:cat.dot}}>x{cnt}</span>}</div>;
                        })}
                      </div>
                      <div style={{height:3,background:"#1E1E2C",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${pct}%`,background:pct===100?"#10B981":"#8B5CF6",borderRadius:2,transition:"width 0.4s"}}/>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* URGENT */}
      {view==="urgent"&&(
        <div style={{padding:"22px 18px",maxWidth:660,margin:"0 auto"}}>
          <div style={{fontSize:20,fontWeight:700,marginBottom:3}}>Urgent Tasks</div>
          <div style={{color:"#555",fontSize:12,marginBottom:20}}>Deadlines within 7 days, sorted by urgency</div>
          {urgentTasks.length===0?(
            <div style={{textAlign:"center",color:"#333",padding:48}}>
              <div style={{fontSize:38,marginBottom:10}}>🎉</div>
              <div style={{fontSize:13}}>No urgent tasks — keep it up!</div>
            </div>
          ):(
            urgentTasks.map(task=>{
              const cat=getCat(task.catId);
              const u=getUrgency(task.ddl);
              const dn=task.steps.filter(s=>s.done).length;
              const tot=task.steps.length;
              const pct=tot===0?0:Math.round((dn/tot)*100);
              return(
                <div key={task.id} style={{background:"#141420",borderRadius:13,marginBottom:10,border:`1.5px solid ${u.color}44`,overflow:"hidden"}}>
                  <div style={{padding:"13px 15px",display:"flex",gap:11,alignItems:"flex-start"}}>
                    <div style={{width:38,height:38,borderRadius:9,background:cat.light,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{cat.emoji}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,flexWrap:"wrap"}}>
                        <span style={{fontSize:14,fontWeight:600}}>{task.text}</span>
                        <span style={{fontSize:10,padding:"1px 6px",borderRadius:8,background:cat.light,color:cat.dot,fontWeight:700}}>{cat.label}</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                        <Stars urgency={u}/>
                        <span style={{fontSize:11,color:u.color,fontWeight:700}}>{u.label}</span>
                        {task.startDate&&<span style={{fontSize:10,color:"#444"}}>Start {fmtDate(task.startDate)}</span>}
                        {task.ddl&&<span style={{fontSize:10,color:u.color}}>Due {fmtDate(task.ddl)}</span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <div style={{flex:1,height:4,background:"#1E1E2C",borderRadius:2,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${pct}%`,background:pct===100?"#10B981":u.color,borderRadius:2,transition:"width 0.4s"}}/>
                        </div>
                        <span style={{fontSize:10,color:"#555"}}>{dn}/{tot}</span>
                      </div>
                    </div>
                  </div>
                  {task.steps.length>0&&(
                    <div style={{borderTop:"1px solid #1A1A2A",padding:"9px 15px 12px"}}>
                      {task.steps.map(step=>(
                        <div key={step.id} onClick={()=>toggleStep(task.key,task.id,step.id)} style={{display:"flex",gap:8,marginBottom:7,cursor:"pointer",alignItems:"flex-start"}}>
                          <div style={{width:14,height:14,borderRadius:4,flexShrink:0,marginTop:2,border:step.done?"none":`2px solid ${cat.color}`,background:step.done?cat.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#fff"}}>{step.done?"✓":""}</div>
                          <div>
                            <div style={{fontSize:12,fontWeight:600,color:step.done?"#444":"#C0B8B0",textDecoration:step.done?"line-through":"none"}}>{step.step}</div>
                            <div style={{fontSize:10,color:"#404040"}}>{step.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* PROGRESS */}
      {view==="progress"&&(
        <div style={{padding:"22px 18px",maxWidth:700,margin:"0 auto"}}>
          <div style={{fontSize:20,fontWeight:700,marginBottom:3}}>Progress Overview</div>
          <div style={{color:"#555",fontSize:12,marginBottom:20}}>{allTasks.length} tasks · {doneSteps}/{totalSteps} steps completed</div>
          <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:22,background:"#141420",borderRadius:15,padding:20,border:"1px solid #1E1E2C",marginBottom:16}}>
            <svg width={84} height={84} viewBox="0 0 84 84">
              <circle cx="42" cy="42" r="34" fill="none" stroke="#1E1E2C" strokeWidth="8"/>
              <circle cx="42" cy="42" r="34" fill="none" stroke="url(#pg)" strokeWidth="8"
                strokeDasharray={`${2*Math.PI*34}`}
                strokeDashoffset={`${2*Math.PI*34*(1-overallPct/100)}`}
                strokeLinecap="round" transform="rotate(-90 42 42)"
                style={{transition:"stroke-dashoffset 0.6s"}}/>
              <defs><linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#8B5CF6"/><stop offset="100%" stopColor="#EC4899"/></linearGradient></defs>
              <text x="42" y="47" textAnchor="middle" fill="#EDE8E0" fontSize="15" fontWeight="bold">{overallPct}%</text>
            </svg>
            <div style={{display:"flex",flexDirection:"column",justifyContent:"center",gap:8}}>
              {catStats.filter(c=>c.count>0).map(cat=>(
                <div key={cat.id} style={{display:"flex",alignItems:"center",gap:9}}>
                  <span style={{fontSize:11,width:62,color:cat.dot,fontWeight:600,flexShrink:0}}>{cat.emoji} {cat.label}</span>
                  <div style={{flex:1,height:5,background:"#1E1E2C",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${cat.pct}%`,background:cat.color,borderRadius:3,transition:"width 0.5s"}}/>
                  </div>
                  <span style={{fontSize:10,color:"#555",width:28,textAlign:"right"}}>{cat.pct}%</span>
                </div>
              ))}
              {catStats.every(c=>c.count===0)&&<div style={{color:"#444",fontSize:12}}>No tasks yet — add some from the calendar!</div>}
            </div>
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:13}}>
            {[["all","All","#8B5CF6"],...CATEGORIES.map(c=>[c.id,`${c.emoji} ${c.label}`,c.color])].map(([id,lbl,clr])=>(
              <button key={id} onClick={()=>setFilterCat(id)} style={{padding:"3px 10px",borderRadius:20,cursor:"pointer",border:`1.5px solid ${filterCat===id?clr:"#1E1E2C"}`,background:filterCat===id?clr+"22":"transparent",color:filterCat===id?clr:"#555",fontSize:10,fontFamily:"inherit",fontWeight:600}}>{lbl}</button>
            ))}
          </div>
          {filteredTasks.length===0?(
            <div style={{textAlign:"center",color:"#444",padding:36}}><div style={{fontSize:34,marginBottom:8}}>📅</div><div style={{fontSize:12}}>No tasks to show</div></div>
          ):(
            filteredTasks.map(task=>{
              const cat=getCat(task.catId);
              const u=getUrgency(task.ddl);
              const dn=task.steps.filter(s=>s.done).length;
              const tot=task.steps.length;
              const pct=tot===0?0:Math.round((dn/tot)*100);
              const [,tm,td]=task.key.split("-");
              const isExp=expandedTask===task.id;
              return(
                <div key={task.id} style={{background:"#141420",borderRadius:12,marginBottom:9,border:`1px solid ${cat.color}33`,overflow:"hidden"}}>
                  <div onClick={()=>setExpandedTask(isExp?null:task.id)} style={{padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:34,height:34,borderRadius:8,background:cat.light,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>{cat.emoji}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                        <span style={{fontSize:13,fontWeight:600}}>{task.text}</span>
                        <span style={{fontSize:9,padding:"1px 5px",borderRadius:7,background:cat.light,color:cat.dot,fontWeight:700}}>{cat.label}</span>
                        {u&&u.stars>0&&<Stars urgency={u}/>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                        {task.startDate&&<span style={{fontSize:10,color:"#444"}}>Start {fmtDate(task.startDate)}</span>}
                        {task.ddl&&<span style={{fontSize:10,color:u&&u.stars>0?u.color:"#555"}}>Due {fmtDate(task.ddl)}</span>}
                        <span style={{fontSize:10,color:"#444"}}>{MONTHS_SHORT[Number(tm)]} {td}</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{flex:1,height:3,background:"#1E1E2C",borderRadius:2,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${pct}%`,background:pct===100?"#10B981":cat.color,borderRadius:2,transition:"width 0.4s"}}/>
                        </div>
                        <span style={{fontSize:10,color:"#555"}}>{dn}/{tot}</span>
                      </div>
                    </div>
                    <span style={{color:"#333",fontSize:10}}>{isExp?"▲":"▼"}</span>
                  </div>
                  {isExp&&(
                    <div style={{borderTop:"1px solid #1A1A2A",padding:"8px 14px 12px"}}>
                      {task.steps.map(step=>(
                        <div key={step.id} onClick={()=>toggleStep(task.key,task.id,step.id)} style={{display:"flex",gap:8,marginBottom:7,cursor:"pointer",alignItems:"flex-start"}}>
                          <div style={{width:14,height:14,borderRadius:4,flexShrink:0,marginTop:2,border:step.done?"none":`2px solid ${cat.color}`,background:step.done?cat.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#fff"}}>{step.done?"✓":""}</div>
                          <div>
                            <div style={{fontSize:12,fontWeight:600,color:step.done?"#444":"#C0B8B0",textDecoration:step.done?"line-through":"none"}}>{step.step}</div>
                            <div style={{fontSize:10,color:"#404040"}}>{step.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* DAY MODAL */}
      {showModal&&selectedDay&&(
        <div onClick={()=>setShowModal(false)} style={{position:"fixed",inset:0,background:"rgba(171,152,162,0.5)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200,backdropFilter:"blur(6px)"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#61595d",borderRadius:"18px 18px 0 0",padding:"17px 17px 38px",width:"100%",maxWidth:540,maxHeight:"90vh",overflowY:"auto",border:"1px solid #c9b8c0",borderBottom:"none"}}>
            <div style={{width:32,height:3,background:"#ab98a2",borderRadius:2,margin:"0 auto 15px"}}/>
            <div style={{marginBottom:15}}>
              <div style={{fontSize:18,fontWeight:700}}>{MONTHS[month]} {selectedDay}, {year}</div>
              <div style={{fontSize:11,color:"#444",marginTop:1}}>{dayTasks.length} {dayTasks.length===1?"task":"tasks"}</div>
            </div>

            {/* ADD FORM */}
            <div style={{background:"#ecdde5",borderRadius:13,padding:13,marginBottom:17,border:"1px solid #c9b8c0"}}>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                {CATEGORIES.map(cat=>(
                  <button key={cat.id} onClick={()=>setNewCat(cat.id)} style={{display:"flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:20,cursor:"pointer",border:`1.5px solid ${newCat===cat.id?cat.color:"#c9b8c0"}`,background:newCat===cat.id?cat.light:"transparent",color:newCat===cat.id?cat.dot:"#7a6570",fontSize:11,fontFamily:"inherit",fontWeight:600,transition:"all 0.15s"}}>
                    <span>{cat.emoji}</span>{cat.label}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:6,marginBottom:9}}>
                <input ref={inputRef} value={newText} onChange={e=>setNewText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()}
                  placeholder={`Add a ${getCat(newCat).label.toLowerCase()} task…`}
                  style={{flex:1,background:"#f5edf1",border:"1px solid #c9b8c0",borderRadius:8,color:"#3a2a32",padding:"8px 10px",fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                <button onClick={addTask} disabled={!newText.trim()||aiLoading} style={{background:`linear-gradient(135deg,${getCat(newCat).color},${getCat(newCat).dot})`,border:"none",borderRadius:8,color:"#fff",padding:"8px 13px",cursor:"pointer",fontSize:18,opacity:!newText.trim()||aiLoading?0.4:1,transition:"opacity 0.2s"}}>+</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                <div>
                  <div style={{fontSize:10,color:"#555",marginBottom:3}}>📅 Start date</div>
                  <input type="date" value={newStart} onChange={e=>setNewStart(e.target.value)}
                    style={{width:"100%",background:"#f5edf1",border:"1px solid #c9b8c0",borderRadius:7,color:"#7a6570",padding:"6px 8px",fontSize:11,fontFamily:"inherit",outline:"none",colorScheme:"light"}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#555",marginBottom:3}}>🏁 Deadline</div>
                  <input type="date" value={newDDL} onChange={e=>setNewDDL(e.target.value)} min={newStart||todayStr}
                    style={{width:"100%",background:"#f5edf1",border:`1px solid ${previewUrg&&previewUrg.stars>0?previewUrg.color+"66":"#c9b8c0"}`,borderRadius:7,color:"#7a6570",padding:"6px 8px",fontSize:11,fontFamily:"inherit",outline:"none",colorScheme:"light"}}/>
                </div>
              </div>
              {previewUrg&&previewUrg.stars>0&&(
                <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8,background:previewUrg.color+"18",borderRadius:7,padding:"6px 10px",border:`1px solid ${previewUrg.color}33`}}>
                  <Stars urgency={previewUrg}/>
                  <span style={{fontSize:11,color:previewUrg.color,fontWeight:700}}>{previewUrg.label}</span>
                  {previewUrg.overdue&&<span style={{fontSize:10,color:"#EF4444"}}>← please check the date</span>}
                </div>
              )}
              {previewUrg&&previewUrg.stars===0&&newDDL&&(
                <div style={{marginTop:7,fontSize:10,color:"#555",padding:"4px 8px"}}>☆☆☆☆☆ {previewUrg.label} — no urgent reminder yet</div>
              )}
            </div>

            {/* TASK LIST */}
            {dayTasks.length===0?(
              <div style={{textAlign:"center",color:"#333",padding:"22px 0",fontSize:12}}>Pick a category → type a task → set dates ↑</div>
            ):(
              dayTasks.map(task=>{
                const cat=getCat(task.catId);
                const u=getUrgency(task.ddl);
                const dn=task.steps.filter(s=>s.done).length;
                const tot=task.steps.length;
                const pct=tot===0?0:Math.round((dn/tot)*100);
                return(
                  <div key={task.id} style={{background:"#ecdde5",borderRadius:12,marginBottom:10,border:`1px solid ${u&&u.stars>=3?u.color:cat.color}40`,overflow:"hidden"}}>
                    <div style={{padding:"10px 12px 8px",borderBottom:"1px solid #c9b8c0",display:"flex",alignItems:"flex-start",gap:8}}>
                      <span style={{fontSize:15,marginTop:1}}>{cat.emoji}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                          {editingTask?.taskId===task.id
                            ? <input autoFocus value={editingTask.text}
                            onChange={e=>setEditingTask(prev=>({...prev,text:e.target.value}))}
                            onBlur={()=>updateTaskText(dayKey,task.id,editingTask.text)}
                            onKeyDown={e => { if (e.key === "Enter") updateTaskText(dayKey, task.id, editingTask.text); if (e.key === "Escape") setEditingTask(null); }}
                            style={{ fontSize: 13, fontWeight: 600, background: "#0F0F1A", border: "1px solid #8B5CF6", borderRadius: 5, color: "#EDE8E0", padding: "1px 6px", outline: "none", width: "100%" }} />
                          : <span style={{fontSize:13,fontWeight:600,cursor:"text"}} onClick={()=>setEditingTask({key:dayKey,taskId:task.id,text:task.text})}>{task.text}</span>
                          }
                          <span style={{fontSize:9,padding:"1px 5px",borderRadius:7,background:cat.light,color:cat.dot,fontWeight:700}}>{cat.label}</span>
                          {u&&u.stars>0&&(
                            <span style={{display:"flex",alignItems:"center",gap:3,background:u.color+"22",borderRadius:7,padding:"1px 5px"}}>
                              <Stars urgency={u}/>
                              <span style={{fontSize:9,color:u.color,fontWeight:700}}>{u.label}</span>
                            </span>
                          )}
                        </div>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:5}}>
                          {task.startDate&&<span style={{fontSize:10,color:"#444"}}>📅 {fmtDate(task.startDate)}</span>}
                          {task.ddl&&<span style={{fontSize:10,color:u&&u.stars>0?u.color:"#555"}}>🏁 {fmtDate(task.ddl)}</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{flex:1,height:3,background:"#c9b8c0",borderRadius:2,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${pct}%`,background:pct===100?"#10B981":u&&u.stars>=3?u.color:cat.color,borderRadius:2,transition:"width 0.4s"}}/>
                          </div>
                          <span style={{fontSize:10,color:"#555"}}>{dn}/{tot}</span>
                        </div>
                      </div>
                      <button onClick={()=>deleteTask(dayKey,task.id)} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:17,padding:"0 1px",lineHeight:1,flexShrink:0}}>x</button>
                    </div>
                    {task.loading?(
                      <div style={{padding:"10px 12px",color:"#555",fontSize:11,display:"flex",alignItems:"center",gap:6}}>
                        <span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span>
                        AI is breaking down your task…
                      </div>
                    ):(
                      <div style={{padding:"8px 12px 11px"}}>
                        {task.steps.map(step=>(
                          <div key={step.id} onClick={()=>toggleStep(dayKey,task.id,step.id)} style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:7,cursor:"pointer"}}>
                            <div style={{width:14,height:14,borderRadius:4,flexShrink:0,marginTop:2,border:step.done?"none":`2px solid ${cat.color}`,background:step.done?cat.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#fff",transition:"all 0.15s"}}>{step.done?"✓":""}</div>
                            <div>
                              <div style={{fontSize:12,fontWeight:600,color:step.done?"#444":"#C0B8B0",textDecoration:step.done?"line-through":"none"}}>{step.step}</div>
                              <div style={{fontSize:10,color:"#404040",marginTop:1}}>{step.detail}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#2A2A3A;border-radius:2px}
        input::placeholder{color:#444}
        input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.35);cursor:pointer}
      `}</style>
    </div>
  );
}
