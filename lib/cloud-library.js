export async function saveCloudDraft(kind,content,requestKey){
 const response=await fetch('/api/library',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',kind,content,requestKey})}),data=await response.json();
 if(!response.ok||data.saved!==true||data.storage!=='firestore'||!data.id)throw new Error(data.error||'Your private cloud draft could not be saved. Please retry.');
 window.dispatchEvent(new Event('pincraft:cloud-library-updated'));return data.id;
}
