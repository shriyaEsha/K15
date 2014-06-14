var tex="CODEGEEKS INC.";
var len2=tex.length;
var i=0;
function disp(i)
{
if(i==(len2))
{
document.getElementById("main-header").innerHTML="";
i=0;
window.setTimeout("to()",500);
}
else

document.getElementById("main-header").innerHTML+=tex[i]
}

function type2(p,i)
{
setTimeout(function(){disp(i)},p);
}

function to(){
var p=200
for(i=0;i<=len2;p+=200)
{
type2(p,i)
i=(i+1)
}
}
to()

